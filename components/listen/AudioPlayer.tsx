'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, X, ChevronDown, ListMusic, Volume2, VolumeX } from 'lucide-react';
import { useAudioStore, type AudioPlayback } from '@/store/audioStore';
import { useAuthStore } from '@/store/authStore';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { audioTime, audioTracks } from '@/lib/audio/policy';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useCoverTint } from '@/hooks/useCoverTint';
import { getBuyerRouteState } from '@/components/buyer/buyerNavigation';
import AudioArtwork from './AudioArtwork';
import './listen.css';

function SoundBars({ playing, mini = false }: { playing: boolean; mini?: boolean }) {
  return <span className={`listen-sound-bars${mini ? ' listen-sound-mini' : ''}`} data-playing={playing} aria-hidden="true">{(mini ? [45, 90, 65, 100] : [25, 48, 32, 76, 50, 93, 64, 100, 57, 83, 44, 95, 62, 78, 39, 59, 31, 44]).map((height, index) => <i key={index} style={{ '--bar-height': `${height}%`, '--bar-delay': `${-index * .17}s`, '--bar-speed': `${.65 + (index % 5) * .15}s` } as CSSProperties} />)}</span>;
}
function Player({ playback, uid }: { playback: AudioPlayback; uid: string }) {
  const ref = useRef<HTMLAudioElement>(null); const lastSaved = useRef(0); const changing = useRef(false); const alive = useRef(true); const pathname = usePathname();
  const close = useAudioStore(s => s.close); const set = useAudioStore(s => s.set);
  const [playing, setPlaying] = useState(false); const [seconds, setSeconds] = useState(playback.seconds);
  const [expanded, setExpanded] = useState(!!playback.expanded); const [error, setError] = useState(''); const [rate, setRate] = useState(playback.rate || 1); const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(playback.preview ? playback.title.previewSeconds || 60 : playback.title.durationSeconds);
  const [volume, setVolume] = useState(playback.volume ?? 1); const [deviceVolume, setDeviceVolume] = useState(false);
  const tint = useCoverTint(playback.title);
  const preview = playback.preview === true; const offset = preview ? 0 : playback.partStartSeconds || 0;
  const tracks = audioTracks(playback.title); const trackIndex = tracks.findIndex(track => track.id === (playback.partId || 'main'));
  const hidden = pathname.startsWith('/read/') || pathname.startsWith('/watch/') || pathname.startsWith('/checkout');
  const save = (force = false) => {
    const node = ref.current; if (preview || !node || node.readyState < 1 || (!force && Date.now() - lastSaved.current < 15000) || useAuthStore.getState().firebaseUser?.uid !== uid) return;
    lastSaved.current = Date.now(); void authenticatedPost('/api/audio', { action: 'progress', data: { id: playback.title.id, seconds: offset + node.currentTime, sessionId: playback.sessionId } }).catch(() => { /* Listening continues through brief network interruptions. */ });
  };
  async function load(position: number, retry = false) {
    if (changing.current) return; changing.current = true; setLoading(true); setError(''); save(true);
    try {
      const next = await authenticatedGet<AudioPlayback>(`/api/audio?view=${preview ? 'preview' : 'playback'}&id=${playback.title.id}${preview ? '' : `&position=${position}`}`);
      if (alive.current && useAuthStore.getState().firebaseUser?.uid === uid) set({ ...next, ...(preview && retry ? { seconds: position } : {}), expanded, rate, volume }, uid);
    } catch (failure) { if (alive.current) setError((failure as Error).message); }
    finally { changing.current = false; if (alive.current) setLoading(false); }
  }
  function seek(position: number) {
    const target = Math.max(0, Math.min(duration, position)); const node = ref.current;
    if (!node || changing.current) return;
    const current = tracks[trackIndex];
    if (preview || (target >= offset && (target < offset + (current?.durationSeconds || node.duration) || (target === duration && trackIndex === tracks.length - 1)))) {
      node.currentTime = Math.max(0, Math.min(node.duration || 0, target - offset)); setSeconds(target); save(true);
    } else void load(target);
  }
  useEffect(() => { if (hidden) ref.current?.pause(); }, [hidden]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const hide = () => { if (document.hidden) save(true); };
    document.addEventListener('visibilitychange', hide);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: `${preview ? 'Sample · ' : ''}${playback.title.title}`, artist: playback.title.creatorName, album: 'AfroBooks Listen', ...(playback.title.coverUrl ? { artwork: [{ src: playback.title.coverUrl }] } : {}) });
      navigator.mediaSession.setActionHandler('play', () => { void node.play().catch(() => setError('Tap Play to continue.')); });
      navigator.mediaSession.setActionHandler('pause', () => node.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => seek(offset + node.currentTime - 15));
      navigator.mediaSession.setActionHandler('seekforward', () => seek(offset + node.currentTime + 15));
    }
    return () => { document.removeEventListener('visibilitychange', hide); if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; for (const action of ['play', 'pause', 'seekbackward', 'seekforward'] as const) navigator.mediaSession.setActionHandler(action, null); } };
    // Each source/account change mounts a new player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, uid, expanded, rate, duration, volume]);
  function toggle() { const node = ref.current!; if (playing) node.pause(); else { if (preview && node.currentTime >= duration) node.currentTime = 0; void node.play().catch(() => setError('Unable to play. Try again.')); } }
  function changeVolume(value: number) { const node = ref.current!; node.volume = value; setDeviceVolume(Math.abs(node.volume - value) > .01); setVolume(node.volume); }
  return <><div hidden={hidden} aria-hidden="true" style={{ height: expanded ? 360 : 100 }} /><section className="listen-player" data-expanded={expanded} data-playing={playing} data-has-dock={getBuyerRouteState(pathname).showBottomNav} style={tint} aria-label="Audio player" hidden={hidden}>
    {expanded && <div className="listen-player-atmosphere" aria-hidden="true"><span style={playback.title.coverUrl ? { backgroundImage: `url(${JSON.stringify(playback.title.coverUrl)})` } : undefined} /></div>}
    <audio ref={ref} src={playback.url} preload="metadata" autoPlay onLoadedMetadata={() => { const node = ref.current!; node.playbackRate = rate; node.volume = volume; if (Number.isFinite(node.duration)) { if (preview) setDuration(Math.min(node.duration, playback.title.previewSeconds || 60)); node.currentTime = Math.max(0, Math.min(playback.seconds - offset, node.duration - .05)); } }}
      onPlay={event => { document.querySelectorAll('audio,video').forEach(other => { if (other !== event.currentTarget) (other as HTMLMediaElement).pause(); }); setPlaying(true); setError(''); }} onPause={() => { setPlaying(false); save(true); }}
      onTimeUpdate={() => { const node = ref.current!; if (preview && node.currentTime >= duration) node.pause(); setSeconds(Math.min(duration, offset + node.currentTime)); save(); }}
      onEnded={() => { setPlaying(false); save(true); const next = tracks[trackIndex + 1]; if (!preview && next) void load(next.startSeconds); }} onError={() => setError('Playback stopped. Check your connection and try again.')} />
    <div className="listen-player-row"><button className="listen-player-title" aria-label={expanded ? 'Collapse audio player' : 'Expand audio player'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <><ChevronDown size={20} /><span className="listen-player-heading"><small>AfroBooks Listen</small><strong>{preview ? 'Free sample' : 'Now playing'}</strong></span></> : <><AudioArtwork mini category={playback.title.category} coverUrl={playback.title.coverUrl} /><span><strong dir="auto">{playback.title.title}</strong><small dir="auto">{preview ? 'Free sample' : playback.title.creatorName}</small></span></>}</button>
      {!expanded && <button className="listen-round listen-primary" disabled={loading} aria-label={playing ? 'Pause audio' : 'Play audio'} onClick={toggle}>{playing ? <Pause size={21} /> : <Play size={21} />}</button>}
      <button className="listen-round" aria-label="Close audio player" onClick={() => { save(true); ref.current?.pause(); close(); }}><X size={20} /></button></div>
    {!expanded && <div className="listen-mini-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, seconds / (duration || 1) * 100)}%` }} /></div>}
    {expanded && <div className="listen-expanded"><div className="listen-now-playing"><p className="listen-eyebrow">{playback.title.category}</p><AudioArtwork category={playback.title.category} coverUrl={playback.title.coverUrl} /><strong dir="auto">{playback.title.title}</strong><span dir="auto">{playback.title.creatorName}</span>{!preview && tracks.length > 1 && <p className="listen-current-recording" dir="auto">{tracks[trackIndex]?.title}</p>}<SoundBars playing={playing} /></div>
      <div className="listen-transport"><input type="range" aria-label="Audio position" min="0" max={duration || 1} step="1" disabled={loading} value={Math.min(seconds, duration)} style={{ '--listen-progress': `${Math.min(100, seconds / (duration || 1) * 100)}%` } as CSSProperties} onChange={event => seek(Number(event.target.value))} /><div className="listen-times"><span aria-label="Elapsed time">{audioTime(seconds)}</span><span aria-label="Remaining time">−{audioTime(Math.max(0, duration - seconds))}</span></div>
      <div className="listen-controls">{!preview && tracks.length > 1 && <button className="listen-round" aria-label="Previous recording" disabled={loading || trackIndex <= 0} onClick={() => seek(tracks[trackIndex - 1].startSeconds)}><SkipBack size={20} /></button>}<button className="listen-round" aria-label="Back 15 seconds" disabled={loading} onClick={() => seek(seconds - 15)}><RotateCcw size={22} /><small>15</small></button><button className="listen-round listen-primary listen-main-play" aria-label={playing ? 'Pause audio' : 'Play audio'} disabled={loading} onClick={toggle}>{playing ? <Pause size={25} /> : <Play size={25} />}</button><button className="listen-round" aria-label="Forward 15 seconds" disabled={loading} onClick={() => seek(seconds + 15)}><RotateCw size={22} /><small>15</small></button>{!preview && tracks.length > 1 && <button className="listen-round" aria-label="Next recording" disabled={loading || trackIndex >= tracks.length - 1} onClick={() => seek(tracks[trackIndex + 1].startSeconds)}><SkipForward size={20} /></button>}</div>
      <div className="listen-playback-options"><button onClick={() => { const next = rate >= 2 ? .75 : rate + .25; setRate(next); ref.current!.playbackRate = next; }} aria-label={`Playback speed ${rate} times`}>{rate}× speed</button><span role="status">{loading ? 'Opening recording…' : preview && seconds >= duration ? 'Sample finished' : playing ? 'Playing' : 'Paused'}</span></div>
      <div className="listen-volume"><button className="listen-round" aria-label={volume ? 'Mute audio' : 'Unmute audio'} onClick={() => changeVolume(volume ? 0 : 1)}>{volume ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><input type="range" aria-label="Volume" min="0" max="1" step="0.05" value={volume} style={{ '--listen-progress': `${volume * 100}%` } as CSSProperties} onChange={event => changeVolume(Number(event.target.value))} /><Volume2 size={15} aria-hidden="true" /></div>{deviceVolume && <p className="listen-muted">Use your device’s volume buttons to change the volume.</p>}</div>
      {!preview && tracks.length > 1 && <section className="listen-up-next" aria-label="Up next"><h3>Up next <small>{tracks.length - Math.max(0, trackIndex)} recordings</small></h3><div className="listen-track-list">{tracks.slice(Math.max(0, trackIndex)).map(track => { const current = track.id === (playback.partId || 'main'); return <button key={track.id} aria-current={current ? 'true' : undefined} disabled={loading} onClick={() => seek(track.startSeconds)}>{current ? <SoundBars mini playing={playing} /> : <Play size={16} aria-hidden="true" />}<span dir="auto">{track.title}</span><small>{audioTime(track.durationSeconds)}</small></button>; })}</div></section>}
      {!preview && !!playback.title.chapters?.length && <details className="listen-player-contents"><summary><ListMusic size={18} /> Chapters</summary><div className="listen-track-list">{playback.title.chapters.map((chapter, index, all) => <button key={index} disabled={loading} aria-current={seconds >= chapter.startSeconds && (!all[index + 1] || seconds < all[index + 1].startSeconds) ? 'true' : undefined} onClick={() => seek(chapter.startSeconds)}><span dir="auto">{chapter.title}</span><small>{audioTime(chapter.startSeconds)}</small></button>)}</div></details>}
    </div>}
    {error && <p role="alert">{error} <button onClick={() => void load(seconds, true)}>Retry</button></p>}
  </section></>;
}
export default function AudioPlayer() {
  const playback = useAudioStore(s => s.playback); const owner = useAudioStore(s => s.uid); const uid = useAuthStore(s => s.firebaseUser?.uid); const installed = useInstalledApp();
  useEffect(() => { if (owner && owner !== uid) useAudioStore.getState().close(); }, [owner, uid]);
  return playback && uid === owner && installed ? <Player key={`${uid}:${playback.url}`} playback={playback} uid={uid} /> : null;
}
