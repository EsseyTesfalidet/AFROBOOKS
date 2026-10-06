'use client';
import { useState } from 'react';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useDiscoveryLanguages } from '@/hooks/useDiscoveryLanguages';
import { DISCOVERY_LANGUAGES, languageKey } from '@/lib/utils/languagePreference';
import { updateExperience, useExperienceStore } from '@/store/experienceStore';
import './experience.css';
export default function LanguageChoices() {
  const installed=useInstalledApp(); const languages=useDiscoveryLanguages(); const prefs=useExperienceStore(); const[error,setError]=useState(''); const[custom,setCustom]=useState(''); const[showMore,setShowMore]=useState(false);
  if(!installed) return null;
  async function save(next:string[]) {setError('');try{await updateExperience('languages',{languages:next});}catch(e){setError((e as Error).message);}}
  const recommended=DISCOVERY_LANGUAGES.slice(0,6); const visible=[...new Set([...(showMore?DISCOVERY_LANGUAGES:recommended),...languages])];
  return <details className="experience-panel"><summary>Languages · {languages.length?languages.join(', '):'All languages'}</summary><p>Your preferred languages appear first. Other languages remain available.</p><div className="experience-actions">{visible.map(language=><button key={language} disabled={prefs.busy} aria-pressed={languages.some(item=>languageKey(item)===languageKey(language))} onClick={()=>void save(languages.some(item=>languageKey(item)===languageKey(language))?languages.filter(item=>languageKey(item)!==languageKey(language)):[...languages,language])}>{language}</button>)}</div>{DISCOVERY_LANGUAGES.length>recommended.length&&<button className="experience-link" onClick={()=>setShowMore(!showMore)}>{showMore?'Show fewer languages':'Show more languages'}</button>}<form className="experience-actions" onSubmit={e=>{e.preventDefault();if(custom.trim())void save([...new Set([...languages,custom.trim()])]).then(()=>setCustom(''));}}><input aria-label="Another language" maxLength={40} value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Another language"/><button disabled={prefs.busy||!custom.trim()}>Add language</button><button type="button" disabled={prefs.busy} onClick={()=>void save([])}>Show all equally</button></form>{(error||prefs.error)&&<p role="alert">{error||prefs.error}</p>}</details>;
}
