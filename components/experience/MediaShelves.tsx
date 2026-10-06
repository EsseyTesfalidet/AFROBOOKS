'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useWatchResource } from '@/components/watch/WatchUI';
import type { MediaCard,CollectionView } from '@/types/experience';
import './experience.css';
function Cards({items}:{items:MediaCard[]}) { return <div className="experience-shelf">{items.map(item=><Link className="experience-card" key={`${item.kind}:${item.id}`} href={item.href}>{item.cover&&<img src={item.cover} alt="" loading="lazy"/>}<small>{({book:'Read',video:'Watch',audio:'Listen'})[item.kind]}</small><strong dir="auto">{item.title}</strong><small dir="auto">{item.creator}</small>{item.progress!==undefined&&<><progress value={item.progress} max={100}/><small>{item.progress}% complete</small></>}</Link>)}</div>; }
function ContinueContent() { const resource=useWatchResource<{items:MediaCard[]}>('/api/experience?view=continue');return <section className="experience-panel"><h2>Continue enjoying</h2><p>Your books, videos and audio, together.</p>{resource.loading?<p role="status">Finding your place…</p>:resource.error?<p role="alert">{resource.error} <button onClick={resource.retry}>Retry</button></p>:resource.data?.items?.length?<Cards items={resource.data.items}/>:<p>Start reading, watching or listening and return here to continue.</p>}</section>; }
export function ContinueEnjoying() { return useInstalledApp()?<ContinueContent/>:null; }
function CollectionsContent() { const resource=useWatchResource<{collections:CollectionView[]}>('/api/experience?view=collections');return <section className="experience-panel"><h2>African story collections</h2><p>Explore a subject through books, films and voices. Each title keeps its own access and price.</p>{resource.loading?<p role="status">Loading collections…</p>:resource.error?<p role="alert">{resource.error} <button onClick={resource.retry}>Retry</button></p>:resource.data?.collections?.length?resource.data.collections.filter(value=>value.items.length).map(value=><details key={value.id}><summary><strong>{value.title}</strong></summary><p>{value.description}</p><Cards items={value.items}/></details>):<p>Curated collections will appear here when published.</p>}</section>; }
export function StoryCollections() { return useInstalledApp()?<CollectionsContent/>:null; }
