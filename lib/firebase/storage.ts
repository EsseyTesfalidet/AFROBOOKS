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
  return storageRef.fullPath;
}

export async function uploadMagazinePdf(sellerId: string, bookId: string, file: File): Promise<string> {
  if (!file.size || file.size > 20 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF of 20 MB or less.');
  const storageRef = ref(storage, `magazines/${sellerId}/${bookId}/${crypto.randomUUID()}.pdf`);
  await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
  return storageRef.fullPath;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `avatars/${userId}/${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function deleteFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}
