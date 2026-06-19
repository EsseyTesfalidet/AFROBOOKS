import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './config';

export async function uploadCoverImage(sellerId: string, bookId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `covers/${sellerId}/${bookId}/${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadManuscript(sellerId: string, bookId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `manuscripts/${sellerId}/${bookId}/${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `avatars/${userId}/${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function deleteFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}
