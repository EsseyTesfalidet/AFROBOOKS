'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, X, ListPlus } from 'lucide-react';
import { useExperienceStore, loadExperience, updateExperience } from '@/store/experienceStore';
import { useAuthStore } from '@/store/authStore';
import { useAudioStore, type AudioPlayback, type QueueTitle } from '@/store/audioStore';
import { authenticatedGet } from '@/lib/firebase/request';
import type { Playlist, MediaCard } from '@/types/experience';
import type { AudioTitle } from '@/types/audio';
import '@/components/experience/experience.css';

export function AddToPlaylist({title}:{title:AudioTitle}) {
  const uid=useAuthStore(s=>s.firebaseUser?.uid);const prefs=useExperienceStore();const[selected,setSelected]=useState('');const[name,setName]=useState('');const[notice,setNotice]=useState('');
  useEffect(()=>{if(uid)void loadExperience(uid);},[uid]);
  const lists=prefs.uid===uid?prefs.playlists:[];
  async function add() {setNotice('');try{const list=lists.find(item=>item.id===selected);await updateExperience('playlist',list?{...list,titleIds:[...new Set([...list.titleIds,title.id])]}:{name,titleIds:[title.id]});setNotice('Added to playlist.');setName('');}catch(e){setNotice((e as Error).message);}}
  return <details className="experience-panel"><summary><ListPlus size={16}/> Playlists & queue</summary><div className="experience-actions"><button onClick={()=>{if(uid){useAudioStore.getState().enqueue({id:title.id,title:title.title,creator:title.creatorName},uid,true);setNotice('Added to Play next.');}}}>Play next</button><button onClick={()=>{if(uid){useAudioStore.getState().enqueue({id:title.id,title:title.title,creator:title.creatorName},uid);setNotice('Added to queue.');}}}>Add to queue</button></div><label>Playlist<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">New playlist</option>{lists.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{!selected&&<label>Playlist name<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>}<div className="experience-actions"><button disabled={prefs.busy||(!selected&&!name.trim())} onClick={()=>void add()}>Save to playlist</button></div>{notice&&<p role="status">{notice}</p>}</details>;
}
const EMPTY_QUEUE: QueueTitle[] = [];
export default function Playlists() {
  const uid=useAuthStore(s=>s.firebaseUser?.uid);const prefs=useExperienceStore();const[name,setName]=useState('');const[items,setItems]=useState<MediaCard[]>([]);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  const queue=useAudioStore(s=>s.uid===uid?s.queue:EMPTY_QUEUE);
  useEffect(()=>{if(uid)void loadExperience(uid);},[uid]);
  useEffect(()=>{let active=true;if(uid&&prefs.uid===uid&&prefs.loaded)authenticatedGet<{items:MediaCard[]}>('/api/experience?view=playlist_titles').then(value=>{if(active)setItems(value.items||[]);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[uid,prefs.uid,prefs.loaded,prefs.playlists]);
  async function run(action:()=>Promise<unknown>) {if(busy)return;setBusy(true);setError('');try{await action();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function start(titles:QueueTitle[]) {
    if(!uid||!titles.length)return;
    const playback=await authenticatedGet<AudioPlayback>(`/api/audio?view=playback&id=${encodeURIComponent(titles[0].id)}&position=0`);
    if(useAuthStore.getState().firebaseUser?.uid!==uid)return;
    useAudioStore.getState().set({...playback,expanded:true},uid);useAudioStore.getState().replaceQueue(titles.slice(1),uid);
  }
  const save=(list:Playlist)=>run(()=>updateExperience('playlist',list));
  return <details className="experience-panel"><summary>My playlists & queue</summary><p>Up to 20 playlists, with 100 titles each. Playback checks access when each title starts.</p><form className="experience-actions" onSubmit={e=>{e.preventDefault();void run(async()=>{await updateExperience('playlist',{name,titleIds:[]});setName('');});}}><input aria-label="New playlist name" maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="New playlist name"/><button disabled={busy||prefs.busy||!name.trim()}>Create playlist</button></form>{(prefs.uid===uid?prefs.playlists:[]).map(list=><details key={list.id}><summary>{list.name} · {list.titleIds.length} titles</summary><form className="experience-actions" onSubmit={e=>{e.preventDefault();const input=new FormData(e.currentTarget);void save({...list,name:String(input.get('name'))});}}><input aria-label={`Rename ${list.name}`} name="name" defaultValue={list.name} maxLength={80} required/><button disabled={busy||prefs.busy}>Rename</button></form>{list.titleIds.map((id,index)=>{const item=items.find(value=>value.id===id);return <div className="experience-row" key={id}><div><Link href={`/listen?title=${encodeURIComponent(id)}`}><strong dir="auto">{item?.title||'Unavailable title'}</strong></Link><small>{item?.creator}</small></div><button aria-label={`Move title ${index+1} up`} disabled={busy||prefs.busy||index===0} onClick={()=>{const titleIds=[...list.titleIds];[titleIds[index-1],titleIds[index]]=[titleIds[index],titleIds[index-1]];void save({...list,titleIds});}}><ArrowUp size={16}/></button><button aria-label={`Move title ${index+1} down`} disabled={busy||prefs.busy||index===list.titleIds.length-1} onClick={()=>{const titleIds=[...list.titleIds];[titleIds[index+1],titleIds[index]]=[titleIds[index],titleIds[index+1]];void save({...list,titleIds});}}><ArrowDown size={16}/></button><button aria-label={`Remove title ${index+1}`} disabled={busy||prefs.busy} onClick={()=>void save({...list,titleIds:list.titleIds.filter(value=>value!==id)})}><X size={16}/></button></div>;})}<div className="experience-actions"><button disabled={busy||!list.titleIds.length} onClick={()=>void run(()=>start(list.titleIds.map(id=>items.find(value=>value.id===id)).filter((value):value is MediaCard=>!!value).map(({id,title,creator})=>({id,title,creator}))))}>Play playlist</button><button disabled={busy||prefs.busy} onClick={()=>{if(window.confirm(`Delete playlist “${list.name}”? Your purchases are kept.`))void run(()=>updateExperience('delete_playlist',{id:list.id}));}}>Delete playlist</button></div></details>)}<h3>Queued titles</h3>{queue.length?<><QueueRows/><div className="experience-actions"><button disabled={busy} onClick={()=>void run(()=>start(queue))}>Start queue</button></div></>:<p>Open an audio title and choose Play next or Add to queue.</p>}{(error||prefs.error)&&<p role="alert">{error||prefs.error}</p>}</details>;
}
export function QueueRows() {
  const queue=useAudioStore(s=>s.queue);
  return <div>{queue.map((item,index)=><div className="experience-row" key={item.id}><div><strong dir="auto">{item.title}</strong><small dir="auto">{item.creator}</small></div><button aria-label={`Move queued title ${index+1} up`} disabled={index===0} onClick={()=>useAudioStore.getState().moveQueued(index,-1)}><ArrowUp size={16}/></button><button aria-label={`Move queued title ${index+1} down`} disabled={index===queue.length-1} onClick={()=>useAudioStore.getState().moveQueued(index,1)}><ArrowDown size={16}/></button><button aria-label={`Remove queued title ${index+1}`} onClick={()=>useAudioStore.getState().removeQueued(index)}><X size={16}/></button></div>)}</div>;
}
