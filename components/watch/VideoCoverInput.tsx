'use client';

import { accountFetch } from '@/lib/network';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

export async function uploadVideoCover(id: string, file: File): Promise<{ posterUrl: string; coverId?: string }> {
  const user = useAuthStore.getState().firebaseUser;
  if (!user) throw new Error('Sign in to continue.');
  const body = new FormData(); body.set('id', id); body.set('file', file);
  const response = await accountFetch('/api/watch/poster', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` }, body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Cover upload failed.');
  return result;
}

function SelectedCover({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file); if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img ref={image} className="watch-editor-poster" alt="Selected cover photo preview" />;
}

export default function VideoCoverInput({ file, current, onChange }: { file?: File; current?: string; onChange: (file?: File) => void }) {
  const [error, setError] = useState('');
  return <section className="watch-cover-picker" aria-label="Video cover photo">
    <label>Cover photo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
      const selected = event.target.files?.[0]; event.target.value = ''; if (!selected) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 3_000_000) { setError('Choose a PNG, JPG or WebP image up to 3 MB.'); return; }
      setError(''); onChange(selected);
    }} /></label>
    <p className="watch-muted">PNG, JPG or WebP · up to 3 MB. A landscape image (16:9) works best. {current ? 'Leave this empty to keep your current cover.' : 'If you skip this, we’ll try to use a frame from your video.'}</p>
    {file ? <SelectedCover file={file} /> : current && <img className="watch-editor-poster" src={current} alt="Current video cover" />}
    {file && <div className="watch-actions"><span className="watch-muted">{file.name}</span><button type="button" className="watch-button" onClick={() => { onChange(undefined); setError(''); }}>Remove selected photo</button></div>}
    {error && <p className="watch-notice" role="alert">{error}</p>}
  </section>;
}
