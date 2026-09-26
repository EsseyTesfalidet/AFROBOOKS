'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { updateUserProfile } from '@/lib/firebase/auth';
import { useAuthStore } from '@/store/authStore';
import { Camera } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

interface Props {
  size?: number;
}

export default function AvatarUpload({ size = 56 }: Props) {
  const userProfile = useAuthStore(s => s.userProfile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  if (!userProfile) return null;

  const initials = `${userProfile.firstName?.[0] ?? ''}${userProfile.lastName?.[0] ?? ''}`.toUpperCase();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userProfile || uploading) return;
    const uid = userProfile.uid;
    e.target.value = '';
    setError('');
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    if (file.size >= 2 * 1024 * 1024) { setError('Image must be under 2MB.'); return; }
    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateUserProfile(uid, { avatarUrl: url });
      const current = useAuthStore.getState().userProfile;
      if (current?.uid === uid) useAuthStore.getState().setUserProfile({ ...current, avatarUrl: url });
    } catch {
      setError('Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center" style={{ width: size }}>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} aria-label={uploading ? 'Uploading profile photo' : 'Change profile photo'} title="Change profile photo" className="relative inline-block rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5b800] disabled:opacity-60" style={{ width: size, height: size }}>
        {userProfile.avatarUrl ? (
          <img
            src={userProfile.avatarUrl}
            alt="Avatar"
            className="rounded-full object-cover w-full h-full"
          />
        ) : (
          <div
            className="rounded-full flex items-center justify-center font-display w-full h-full"
            style={{ background: '#e8442a', color: '#fff', fontSize: size * 0.35 }}
          >
            {initials}
          </div>
        )}
        <span
          className="absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: '#1a1a1a', border: '2px solid #0e0e0e' }}
        >
          {uploading ? <LoadingSpinner size={10} color="#aaa" /> : <Camera size={10} style={{ color: '#aaa' }} />}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" aria-label="Upload profile picture" className="hidden" onChange={handleFile} />
      {error && <p role="alert" className="mt-2 text-center text-xs text-red-300">{error}</p>}
    </div>
  );
}
