'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Headphones, Pause, Play, RotateCcw, RotateCw, X } from 'lucide-react';
import { useAudioStore, type AudioPlayback } from '@/store/audioStore';
import { useAuthStore } from '@/store/authStore';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { audioTime } from '@/lib/audio/policy';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import './listen.css';

function Player({ playback, uid }: { playback: AudioPlayback; uid: string }) {
  const ref = useRef<HTMLAudioElement>(null); const lastSaved = useRef(0); const pathname = usePathname();
  const close = useAudioStore(s => s.close); const set = useAudioStore(s => s.set);
  const [playing, setPlaying] = useState(false); const [seconds, setSeconds] = useState(playback.seconds);
  const [expanded, setExpanded] = useState(false); const [error, setError] = useState(''); const [rate, setRate] = useState(1);
  const [duration, setDuration] = useState(playback.title.durationSeconds);
  const hidden = pathname.startsWith('/read/') || pathname.startsWith('/watch/') || pathname.startsWith('/checkout');
  const save = (force = false) => {
    const node = ref.current; if (!node || (!force && Date.now() - lastSaved.current < 15000) || useAuthStore.getState().firebaseUser?.uid !== uid) return;
    lastSaved.current = Date.now(); void authenticatedPost('/api/audio', { action: 'progress', data: { id: playback.title.id, seconds: node.currentTime, sessionId: playback.sessionId } }).catch(() => { /* Keep listening during a brief network interruption. */ });
  };
  useEffect(() => { if (hidden) ref.current?.pause(); }, [hidden]);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const hide = () => { if (document.hidden) save(true); };
    document.addEventListener('visibilitychange', hide);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: playback.title.title, artist: playback.title.creatorName, album: 'AfroBooks Listen' });
      navigator.mediaSession.setActionHandler('play', () => { void node.play().catch(() => setError('Tap Play to continue.')); });
      navigator.mediaSession.setActionHandler('pause', () => node.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => { node.currentTime = Math.max(0, node.currentTime - 15); });
      navigator.mediaSession.setActionHandler('seekforward', () => { node.currentTime = Math.min(node.duration || 0, node.currentTime + 15); });
    }
    return () => { document.removeEventListener('visibilitychange', hide); if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; for (const action of ['play', 'pause', 'seekbackward', 'seekforward'] as const) navigator.mediaSession.setActionHandler(action, null); } };
    // Playback is remounted for every source/account change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, uid]);
  async function retry() {
    try { const next = await authenticatedGet<AudioPlayback>(`/api/audio?view=playback&id=${playback.title.id}`); if (useAuthStore.getState().firebaseUser?.uid === uid) set({ ...next, seconds }, uid); }
    catch (failure) { setError((failure as Error).message); }
  }
  return <><div hidden={hidden} aria-hidden="true" style={{ height: expanded ? 210 : 100 }} /><section className="listen-player" aria-label="Audio player" hidden={hidden}>
    <audio ref={ref} src={playback.url} preload="metadata" autoPlay onLoadedMetadata={() => { const node = ref.current!; if (Number.isFinite(node.duration)) { setDuration(node.duration); node.currentTime = Math.min(playback.seconds, Math.max(0, node.duration - 1)); } }}
      onPlay={() => { setPlaying(true); setError(''); }} onPause={() => { setPlaying(false); save(true); }} onTimeUpdate={() => { setSeconds(ref.current?.currentTime || 0); save(); }} onEnded={() => { setPlaying(false); save(true); }} onError={() => setError('Playback stopped. Check your connection and try again.')} />
    <div className="listen-player-row"><button className="listen-player-title" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span className="listen-art-mini"><Headphones size={22} /></span><span><strong dir="auto">{playback.title.title}</strong><small dir="auto">{playback.title.creatorName}</small></span></button>
      <button className="listen-round listen-primary" aria-label={playing ? 'Pause audio' : 'Play audio'} onClick={() => { const node = ref.current!; if (playing) node.pause(); else void node.play().catch(() => setError('Unable to play. Try again.')); }}>{playing ? <Pause size={21} /> : <Play size={21} />}</button>
      <button className="listen-round" aria-label="Close audio player" onClick={() => { save(true); ref.current?.pause(); close(); }}><X size={20} /></button></div>
    {expanded && <div className="listen-expanded"><input type="range" aria-label="Audio position" min="0" max={duration || 1} step="1" value={Math.min(seconds, duration)} onChange={event => { ref.current!.currentTime = Number(event.target.value); setSeconds(Number(event.target.value)); }} onPointerUp={() => save(true)} /><div className="listen-times"><span>{audioTime(seconds)}</span><span>{audioTime(duration)}</span></div><div className="listen-controls"><button className="listen-round" aria-label="Back 15 seconds" onClick={() => { ref.current!.currentTime = Math.max(0, seconds - 15); }}><RotateCcw size={22} />15</button><button onClick={() => { const next = rate >= 2 ? .75 : rate + .25; setRate(next); ref.current!.playbackRate = next; }} aria-label={`Playback speed ${rate} times`}>{rate}×</button><button className="listen-round" aria-label="Forward 15 seconds" onClick={() => { ref.current!.currentTime = Math.min(duration, seconds + 15); }}>15<RotateCw size={22} /></button></div></div>}
    {error && <p role="alert">{error} <button onClick={() => void retry()}>Retry</button></p>}
  </section></>;
}
export default function AudioPlayer() {
  const playback = useAudioStore(s => s.playback); const owner = useAudioStore(s => s.uid); const uid = useAuthStore(s => s.firebaseUser?.uid); const installed = useInstalledApp();
  useEffect(() => { if (owner && owner !== uid) useAudioStore.getState().close(); }, [owner, uid]);
  return playback && uid === owner && installed ? <Player key={`${uid}:${playback.url}`} playback={playback} uid={uid} /> : null;
}
