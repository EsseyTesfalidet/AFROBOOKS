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
  const { userProfile, setUserProfile } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  if (!userProfile) return null;

  const initials = `${userProfile.firstName?.[0] ?? ''}${userProfile.lastName?.[0] ?? ''}`.toUpperCase();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2MB.'); return; }
    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${userProfile!.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateUserProfile(userProfile!.uid, { avatarUrl: url });
      setUserProfile({ ...userProfile!, avatarUrl: url });
    } catch {
      setError('Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-block" style={{ width: size, height: size }}>
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
        <button
          type="button"
          title="Upload profile picture"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: '#1a1a1a', border: '2px solid #0e0e0e' }}
        >
          {uploading ? <LoadingSpinner size={10} color="#aaa" /> : <Camera size={10} style={{ color: '#aaa' }} />}
        </button>
        <input ref={inputRef} type="file" accept="image/*" title="Upload profile picture" className="hidden" onChange={handleFile} />
      </div>
      {error && <p className="text-xs mt-1" style={{ color: '#e8442a' }}>{error}</p>}
    </div>
  );
}
