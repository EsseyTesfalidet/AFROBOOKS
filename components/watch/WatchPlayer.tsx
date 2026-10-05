'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isHLSProvider, MediaPlayer, MediaProvider, Poster, PlayButton, SeekButton, PIPButton, useMediaState, type MediaPlayerInstance } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { WifiOff, Play, Pause, RotateCcw, RotateCw, PictureInPicture2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authenticatedPost } from '@/lib/firebase/request';
import { createWatchProgress, playbackPosition, playbackStart, streamPlaybackSource, WATCH_SPEEDS } from '@/lib/watch/playback';
import { watchActionRequest } from './WatchUI';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import './watch-player.css';

export interface WatchPlayback { token: string; expiresAt: number; seconds: number; duration: number }
interface Props { id: string; playback: WatchPlayback; trailer?: boolean; preview?: boolean; title?: string; poster?: string; autoPlay?: boolean }

function TouchPlayControls() {
  const paused = useMediaState('paused');
  return <div className="afro-cinema-center">
    <SeekButton className="vds-button vds-seek-button" seconds={-10} aria-label="Go back 10 seconds"><RotateCcw size={25} aria-hidden="true" /><span>10</span></SeekButton>
    <PlayButton className="vds-button vds-play-button" aria-label={paused ? 'Play' : 'Pause'}><Play className="vds-play-icon" fill="currentColor" aria-hidden="true" /><Pause className="vds-pause-icon" fill="currentColor" aria-hidden="true" /><RotateCcw className="vds-replay-icon" aria-hidden="true" /></PlayButton>
    <SeekButton className="vds-button vds-seek-button" seconds={10} aria-label="Go forward 10 seconds"><RotateCw size={25} aria-hidden="true" /><span>10</span></SeekButton>
  </div>;
}

// Remount for a different account, video or full-video/trailer session.
export default function WatchPlayer(props: Props) {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const [owner] = useState(uid);
  return uid && uid === owner ? <PlayerSession key={`${uid}:${props.id}:${props.trailer}:${props.preview}:${props.playback.token}`} {...props} uid={uid} /> : null;
}

function PlayerSession({ id, playback, trailer = false, preview = false, title = 'Video', poster, uid, autoPlay = false }: Props & { uid: string }) {
  const player = useRef<MediaPlayerInstance>(null);
  const mounted = useRef(true); const readyRef = useRef(false); const retrying = useRef(false);
  const configured = useRef(false); const engaged = useRef(false);
  const initialPosition = preview ? 0 : playbackStart(playback.seconds, playback.duration);
  const positionRef = useRef(initialPosition);
  const [source, setSource] = useState({ ...playback, seconds: initialPosition, attempt: 0 });
  const [error, setError] = useState(''); const [saveError, setSaveError] = useState('');
  const [ready, setReady] = useState(false); const [buffering, setBuffering] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine); const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [active, setActive] = useState(true);
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false);
  const reportSave = useCallback((saved: boolean) => {
    if (mounted.current) setSaveError(saved ? '' : 'Your place could not be saved. We’ll retry when your connection returns.');
  }, []);
  // The factory stores callbacks; ref access happens after a save, never in render.
  // eslint-disable-next-line react-hooks/refs
  const [progress] = useState(() => createWatchProgress({
    initial: playback.seconds, duration: playback.duration,
    isCurrent: () => !trailer && !preview && useAuthStore.getState().firebaseUser?.uid === uid,
    write: seconds => watchActionRequest('progress', { id, seconds }),
    onResult: reportSave,
  }));

  function record(value: number, force = false) {
    if (!Number.isFinite(value)) return;
    const next = playbackPosition(value, source.duration);
    positionRef.current = next; progress.record(next); void progress.flush(force);
  }
  function updateTime(force = false) {
    if (readyRef.current && engaged.current && player.current) record(player.current.currentTime, force);
  }
  function available() {
    if (!configured.current && player.current) {
      configured.current = true;
      // Apply settings only after the media provider is ready.
      player.current.playbackRate = speed;
    }
    readyRef.current = true; setReady(true); setBuffering(false); setError('');
  }
  async function retry() {
    if (retrying.current || useAuthStore.getState().firebaseUser?.uid !== uid) return;
    retrying.current = true; setBusy(true);
    void player.current?.pause().catch(() => {});
    setActive(false); readyRef.current = false; configured.current = false; engaged.current = false;
    setReady(false); setBuffering(false);
    try {
      // Every retry rechecks access and refreshes the expiring playback token.
      const result = await authenticatedPost<WatchPlayback>('/api/watch/playback', { id, trailer });
      if (!mounted.current || useAuthStore.getState().firebaseUser?.uid !== uid) return;
      setError(''); setActive(true);
      setSource(old => ({ ...result, seconds: playbackPosition(positionRef.current, result.duration), attempt: old.attempt + 1 }));
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Unable to reopen this video. Please try again.');
    } finally { retrying.current = false; if (mounted.current) setBusy(false); }
  }

  useEffect(() => {
    mounted.current = true;
    const hide = () => { if (document.visibilityState === 'hidden') void progress.flush(true); };
    const pageHide = () => { void progress.flush(true); };
    const disconnected = () => setOffline(true);
    const connected = () => { setOffline(false); void progress.flush(true); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('offline', disconnected); window.addEventListener('online', connected);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('offline', disconnected); window.removeEventListener('online', connected);
      void progress.flush(true);
    };
  }, [progress]);
  useEffect(() => {
    if (!active || (ready && !buffering) || offline) return;
    const timer = setTimeout(() => setError('Playback is taking longer than expected. Retry here to keep your place.'), 20000);
    return () => clearTimeout(timer);
  }, [active, ready, buffering, offline, source.attempt]);

  const failure = error && <div className="afro-cinema-error" role="alert"><p>{error}</p><button type="button" disabled={busy || offline} onClick={() => void retry()}>{busy ? 'Reopening…' : 'Retry playback'}</button></div>;
  return <section className="watch-player-section" aria-label={trailer ? 'Trailer player' : 'Video player'}>
    <div className="watch-player" data-keep-colors>
      {active && <MediaPlayer key={source.attempt} ref={player} className="afro-cinema" data-keep-colors
        title={`${title}${trailer ? ' — trailer' : ''}`} src={streamPlaybackSource(source.token)}
        viewType="video" streamType="on-demand" playsInline crossOrigin="anonymous" load="eager" preload="metadata"
        currentTime={source.seconds} playbackRate={speed} autoPlay={autoPlay}
        onAutoPlayFail={() => setAutoPlayBlocked(true)}
        onProviderChange={provider => { if (isHLSProvider(provider)) { provider.library = () => import('hls.js'); provider.config = { capLevelToPlayerSize: true, maxBufferLength: 30, backBufferLength: 30 }; } }}
        onCanPlay={available} onPlaying={available} onPlay={() => { engaged.current = true; setAutoPlayBlocked(false); }}
        onTimeUpdate={() => updateTime()} onSeeked={seconds => { setBuffering(false); engaged.current = true; record(seconds, true); }}
        onPause={() => { setBuffering(false); updateTime(true); }} onEnded={() => { setBuffering(false); record(source.duration, true); }}
        onWaiting={() => setBuffering(true)} onRateChange={value => setSpeed(value)}
        onError={() => { setBuffering(false); setError('This video could not play. Check your connection, then retry.'); }}
      >
        <MediaProvider>{poster && <Poster className="vds-poster" src={poster} alt="" />}</MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} colorScheme="dark" seekStep={10} playbackRates={[...WATCH_SPEEDS]}
          menuGroup="bottom" smallLayoutWhen={true} hideQualityBitrate noAudioGain slots={{ googleCastButton: null, airPlayButton: null, chapterTitle: null,
            topControlsGroupStart: <span className="afro-cinema-title" dir="auto">{title}{trailer && <small>Trailer</small>}</span>,
            smallLayout: { playButton: <TouchPlayControls />, afterFullscreenButton: <PIPButton className="vds-button vds-pip-button" aria-label="Picture in picture"><PictureInPicture2 aria-hidden="true" /></PIPButton> },
          }} />
        {failure}
      </MediaPlayer>}
      {!active && failure}
    </div>
    {offline && <p className="watch-player-offline" role="status"><WifiOff size={17} aria-hidden="true" />You’re offline. Reconnect to keep watching and save your place.</p>}
    {trailer && <p className="watch-muted">Trailer · the full video is separate.</p>}
    {autoPlayBlocked && <p className="watch-muted" role="status">Tap Play to start watching.</p>}
    {saveError && <p className="watch-muted" role="status">{saveError}</p>}
  </section>;
}
