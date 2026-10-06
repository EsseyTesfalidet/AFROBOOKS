'use client';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
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
import { QueueRows } from './Playlists';
import { sleepReached } from '@/lib/audio/sleep';
import { classifyPlayerSwipe } from '@/lib/audio/playerGestures';
import { appHaptic } from '@/lib/app/haptics';
import './listen.css';

function SoundBars({ playing, mini = false }: { playing: boolean; mini?: boolean }) {
  return <span className={`listen-sound-bars${mini ? ' listen-sound-mini' : ''}`} data-playing={playing} aria-hidden="true">{(mini ? [45, 90, 65, 100] : [25, 48, 32, 76, 50, 93, 64, 100, 57, 83, 44, 95, 62, 78, 39, 59, 31, 44]).map((height, index) => <i key={index} style={{ '--bar-height': `${height}%`, '--bar-delay': `${-index * .17}s`, '--bar-speed': `${.65 + (index % 5) * .15}s` } as CSSProperties} />)}</span>;
}
function Player({ playback, uid }: { playback: AudioPlayback; uid: string }) {
  const ref = useRef<HTMLAudioElement>(null); const lastSaved = useRef(0); const changing = useRef(false); const alive = useRef(true); const gestureStart = useRef<{ x: number; y: number } | null>(null); const suppressHandleClick = useRef(false); const suppressMiniClick = useRef(false); const pathname = usePathname();
  const close = useAudioStore(s => s.close); const set = useAudioStore(s => s.set);
  const [playing, setPlaying] = useState(false); const [seconds, setSeconds] = useState(playback.seconds);
  const [expanded, setExpanded] = useState(!!playback.expanded); const [error, setError] = useState(''); const [rate, setRate] = useState(playback.rate || 1); const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(playback.preview ? playback.title.previewSeconds || 60 : playback.title.durationSeconds);
  const [volume, setVolume] = useState(playback.volume ?? 1); const [deviceVolume, setDeviceVolume] = useState(false);
  const tint = useCoverTint(playback.title);
  const sleep=useAudioStore(s=>s.sleep);const queue=useAudioStore(s=>s.queue);
  const queueBusy=useRef(false);const sleepStopped=useRef(false);
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
      if (alive.current && useAuthStore.getState().firebaseUser?.uid === uid) set({ ...next, ...(preview && retry ? { seconds: position } : {}), expanded, rate, volume }, uid, { preservePrevious: true });
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
  function stopForSleep(position:number) {
    if(!sleepReached(useAudioStore.getState().sleep,playback.title.id,position))return false;
    sleepStopped.current=true;ref.current?.pause();useAudioStore.getState().setSleep(null);setError('Sleep timer finished. Press Play to continue.');return true;
  }
  useEffect(()=>{
    if(!sleep)return;
    const check=()=>{if(sleepReached(useAudioStore.getState().sleep,playback.title.id,offset+(ref.current?.currentTime||0))){sleepStopped.current=true;ref.current?.pause();useAudioStore.getState().setSleep(null);setError('Sleep timer finished. Press Play to continue.');}};
    const timer=window.setInterval(check,1000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);check();
    return()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
  },[sleep,offset,playback.title.id]);
  async function nextTitle() {
    const first=useAudioStore.getState().queue[0];if(!first||queueBusy.current||stopForSleep(seconds))return;
    queueBusy.current=true;setLoading(true);setError('');save(true);ref.current?.pause();
    try {
      const next=await authenticatedGet<AudioPlayback>(`/api/audio?view=playback&id=${encodeURIComponent(first.id)}&position=0`);
      if(!alive.current||useAuthStore.getState().firebaseUser?.uid!==uid||stopForSleep(seconds))return;
      // A queued title is removed only after authorization and a successful load.
      if(useAudioStore.getState().queue[0]?.id!==first.id)return;
      useAudioStore.getState().removeQueued(0);
      useAudioStore.getState().setPreviousTitle({ id: playback.title.id, title: playback.title.title, creator: playback.title.creatorName, seconds });
      set({...next,expanded,rate,volume},uid,{preservePrevious:true});
    }catch(e){if(alive.current)setError(`Could not open ${first.title}. ${(e as Error).message} The title is still in your queue.`);}
    finally{queueBusy.current=false;if(alive.current)setLoading(false);}
  }
  async function previousTitle() {
    const previous = useAudioStore.getState().previousTitle;
    if (!previous || queueBusy.current || stopForSleep(seconds)) return;
    queueBusy.current = true; setLoading(true); setError(''); save(true); ref.current?.pause();
    try {
      const prior = await authenticatedGet<AudioPlayback>(`/api/audio?view=playback&id=${encodeURIComponent(previous.id)}&position=${Math.max(0, previous.seconds)}`);
      if (!alive.current || useAuthStore.getState().firebaseUser?.uid !== uid || stopForSleep(seconds)) return;
      if (useAudioStore.getState().previousTitle?.id !== previous.id) return;
      useAudioStore.getState().setPreviousTitle({ id: playback.title.id, title: playback.title.title, creator: playback.title.creatorName, seconds });
      set({ ...prior, expanded, rate, volume }, uid, { preservePrevious: true });
    } catch (failure) {
      if (alive.current) setError(`Could not reopen ${previous.title}. ${(failure as Error).message}`);
    } finally { queueBusy.current = false; if (alive.current) setLoading(false); }
  }
  function beginGesture(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    gestureStart.current = { x: event.clientX, y: event.clientY };
  }
  function beginMiniExpandGesture(event: ReactPointerEvent<HTMLElement>) {
    if (!expanded) beginGesture(event);
  }
  function endMiniExpandGesture(event: ReactPointerEvent<HTMLElement>) {
    const start = gestureStart.current; gestureStart.current = null;
    if (!start || expanded) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) >= 18 || Math.abs(deltaY) >= 18) {
      suppressMiniClick.current = true;
      window.setTimeout(() => { suppressMiniClick.current = false; }, 0);
    }
    if (classifyPlayerSwipe(deltaX, deltaY) === 'expand') {
      appHaptic(); setExpanded(true);
    }
  }
  function endArtworkGesture(event: ReactPointerEvent<HTMLElement>) {
    const start = gestureStart.current; gestureStart.current = null;
    if (!start || loading || preview) return;
    const direction = classifyPlayerSwipe(event.clientX - start.x, event.clientY - start.y);
    if (direction === 'next') {
      const next = tracks[trackIndex + 1];
      if (next) { appHaptic(); seek(next.startSeconds); }
      else if (queue.length) { appHaptic(); void nextTitle(); }
    } else if (direction === 'previous') {
      if (trackIndex > 0) { appHaptic(); seek(tracks[trackIndex - 1].startSeconds); }
      else if (useAudioStore.getState().previousTitle) { appHaptic(); void previousTitle(); }
    }
  }
  function endCollapseGesture(event: ReactPointerEvent<HTMLElement>) {
    const start = gestureStart.current; gestureStart.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) >= 18 || Math.abs(deltaY) >= 18) {
      suppressHandleClick.current = true;
      window.setTimeout(() => { suppressHandleClick.current = false; }, 0);
    }
    if (classifyPlayerSwipe(deltaX, deltaY) === 'collapse') {
      appHaptic(); setExpanded(false);
    }
  }
  function toggle() { const node = ref.current!; if (playing) node.pause(); else { if (preview && node.currentTime >= duration) node.currentTime = 0; void node.play().catch(() => setError('Unable to play. Try again.')); } }
  function changeVolume(value: number) { const node = ref.current!; node.volume = value; setDeviceVolume(Math.abs(node.volume - value) > .01); setVolume(node.volume); }
  return <><div hidden={hidden} aria-hidden="true" style={{ height: expanded ? 360 : 100 }} /><section className="listen-player" data-expanded={expanded} data-playing={playing} data-has-dock={getBuyerRouteState(pathname).showBottomNav} style={tint} aria-label="Audio player" hidden={hidden}>
    {expanded && <div className="listen-player-atmosphere" aria-hidden="true"><span style={playback.title.coverUrl ? { backgroundImage: `url(${JSON.stringify(playback.title.coverUrl)})` } : undefined} /></div>}
    {expanded && <button type="button" className="listen-player-swipe-handle" aria-label="Swipe down or tap to minimize audio player" onClick={() => { if (suppressHandleClick.current) { suppressHandleClick.current = false; return; } setExpanded(false); }} onPointerDown={beginGesture} onPointerUp={endCollapseGesture} onPointerCancel={() => { gestureStart.current = null; suppressHandleClick.current = false; }}><span /></button>}
    <audio ref={ref} src={playback.url} preload="metadata" autoPlay onLoadedMetadata={() => { const node = ref.current!; node.playbackRate = rate; node.volume = volume; if (Number.isFinite(node.duration)) { if (preview) setDuration(Math.min(node.duration, playback.title.previewSeconds || 60)); node.currentTime = Math.max(0, Math.min(playback.seconds - offset, node.duration - .05)); } }}
      onPlay={event => { if(stopForSleep(offset+event.currentTarget.currentTime))return; sleepStopped.current=false; document.querySelectorAll('audio,video').forEach(other => { if (other !== event.currentTarget) (other as HTMLMediaElement).pause(); }); setPlaying(true); setError(''); }} onPause={() => { setPlaying(false); save(true); }}
      onTimeUpdate={() => { const node = ref.current!; stopForSleep(offset+node.currentTime); if (preview && node.currentTime >= duration) node.pause(); setSeconds(Math.min(duration, offset + node.currentTime)); save(); }}
      onEnded={() => { setPlaying(false); save(true); if(sleepStopped.current||stopForSleep(offset+(ref.current?.duration||0)))return; const next = tracks[trackIndex + 1]; if (!preview && next) void load(next.startSeconds); else if(!preview)void nextTitle(); }} onError={() => setError('Playback stopped. Check your connection and try again.')} />
    <div className="listen-player-row"><button className="listen-player-title" aria-label={expanded ? 'Collapse audio player' : 'Expand audio player'} aria-expanded={expanded} onPointerDown={beginMiniExpandGesture} onPointerUp={endMiniExpandGesture} onPointerCancel={() => { gestureStart.current = null; suppressMiniClick.current = false; }} onClick={() => { if (suppressMiniClick.current) { suppressMiniClick.current = false; return; } setExpanded(!expanded); }}>{expanded ? <><ChevronDown size={20} /><span className="listen-player-heading"><small>AfroBooks Listen</small><strong>{preview ? 'Free sample' : 'Now playing'}</strong></span></> : <><AudioArtwork mini category={playback.title.category} coverUrl={playback.title.coverUrl} /><span><strong dir="auto">{playback.title.title}</strong><small dir="auto">{preview ? 'Free sample' : playback.title.creatorName}</small></span></>}</button>
      {!expanded && <button className="listen-round listen-primary" disabled={loading} aria-label={playing ? 'Pause audio' : 'Play audio'} onClick={toggle}>{playing ? <Pause size={21} /> : <Play size={21} />}</button>}
      <button className="listen-round" aria-label="Close audio player" onClick={() => { save(true); ref.current?.pause(); close(); }}><X size={20} /></button></div>
    {!expanded && <div className="listen-mini-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, seconds / (duration || 1) * 100)}%` }} /></div>}
    {expanded && <div className="listen-expanded"><div className="listen-now-playing" onPointerDown={beginGesture} onPointerUp={endArtworkGesture} onPointerCancel={() => { gestureStart.current = null; }}><p className="listen-eyebrow">{playback.title.category}</p><AudioArtwork category={playback.title.category} coverUrl={playback.title.coverUrl} /><strong dir="auto">{playback.title.title}</strong><span dir="auto">{playback.title.creatorName}</span>{!preview && tracks.length > 1 && <p className="listen-current-recording" dir="auto">{tracks[trackIndex]?.title}</p>}<SoundBars playing={playing} /></div>
      <div className="listen-transport"><input type="range" aria-label="Audio position" min="0" max={duration || 1} step="1" disabled={loading} value={Math.min(seconds, duration)} style={{ '--listen-progress': `${Math.min(100, seconds / (duration || 1) * 100)}%` } as CSSProperties} onChange={event => seek(Number(event.target.value))} /><div className="listen-times"><span aria-label="Elapsed time">{audioTime(seconds)}</span><span aria-label="Remaining time">−{audioTime(Math.max(0, duration - seconds))}</span></div>
      <div className="listen-controls">{!preview && tracks.length > 1 && <button className="listen-round" aria-label="Previous recording" disabled={loading || trackIndex <= 0} onClick={() => seek(tracks[trackIndex - 1].startSeconds)}><SkipBack size={20} /></button>}<button className="listen-round" aria-label="Back 15 seconds" disabled={loading} onClick={() => seek(seconds - 15)}><RotateCcw size={22} /><small>15</small></button><button className="listen-round listen-primary listen-main-play" aria-label={playing ? 'Pause audio' : 'Play audio'} disabled={loading} onClick={toggle}>{playing ? <Pause size={25} /> : <Play size={25} />}</button><button className="listen-round" aria-label="Forward 15 seconds" disabled={loading} onClick={() => seek(seconds + 15)}><RotateCw size={22} /><small>15</small></button>{!preview && tracks.length > 1 && <button className="listen-round" aria-label="Next recording" disabled={loading || trackIndex >= tracks.length - 1} onClick={() => seek(tracks[trackIndex + 1].startSeconds)}><SkipForward size={20} /></button>}</div>
      <div className="listen-playback-options"><button onClick={() => { const next = rate >= 2 ? .75 : rate + .25; setRate(next); ref.current!.playbackRate = next; }} aria-label={`Playback speed ${rate} times`}>{rate}× speed</button><span role="status">{loading ? 'Opening recording…' : preview && seconds >= duration ? 'Sample finished' : playing ? 'Playing' : 'Paused'}</span></div>
      <div className="listen-volume"><button className="listen-round" aria-label={volume ? 'Mute audio' : 'Unmute audio'} onClick={() => changeVolume(volume ? 0 : 1)}>{volume ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><input type="range" aria-label="Volume" min="0" max="1" step="0.05" value={volume} style={{ '--listen-progress': `${volume * 100}%` } as CSSProperties} onChange={event => changeVolume(Number(event.target.value))} /><Volume2 size={15} aria-hidden="true" /></div>{deviceVolume && <p className="listen-muted">Use your device’s volume buttons to change the volume.</p>}</div>
      <div className="listen-sleep"><label>Sleep timer<select aria-label="Sleep timer" value={sleep?.mode==='time'?'active':sleep?.mode||'off'} onChange={event=>{const choice=event.target.value;const store=useAudioStore.getState();if(choice==='off')store.setSleep(null);else if(choice==='chapter')store.setSleep({mode:'chapter',titleId:playback.title.id,position:preview?duration:playback.title.chapters?.find(ch=>ch.startSeconds>seconds+1)?.startSeconds||offset+(tracks[trackIndex]?.durationSeconds||duration)});else if(choice!=='active')store.setSleep({mode:'time',deadline:Date.now()+Number(choice)*60000});}}><option value="off">Off</option>{sleep?.mode==='time'&&<option value="active">Timer set</option>}<option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="chapter">End of {playback.title.chapters?.length?'chapter':'recording'}</option></select></label></div>
      {queue.length>0&&<section className="experience-panel listen-title-queue" aria-label="Queued audio titles"><h3>Play next · {queue.length}</h3><QueueRows/><div className="experience-actions"><button disabled={loading} onClick={()=>void nextTitle()}>Play next title</button></div></section>}
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
