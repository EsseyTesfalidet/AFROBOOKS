import type { WatchAsset } from '@/types/video';

export function videoReadiness(asset?: WatchAsset, pending = false, error = '') {
  if (asset?.ready) return { label: 'Ready to preview', message: 'Private preview · use fullscreen, seek, speed and available subtitles to check your video.' };
  if (error) return { label: 'Upload needs attention', message: error };
  if (!asset) return pending
    ? { label: 'Upload not confirmed', message: 'The upload link was not confirmed. Check the upload error in the creator studio and the video hosting connection. This is not video processing.' }
    : { label: 'No video uploaded', message: 'The creator needs to select a video file and finish uploading it before a preview is available.' };
  if (asset.processingState === 'pendingupload') return { label: 'Waiting for upload', message: 'Cloudflare is waiting for the video file. Return to the creator studio, select the same file and resume uploading.' };
  if (asset.processingState === 'error') return { label: 'Processing failed', message: 'The video could not be processed. Check the upload with the administrator before trying again.' };
  if (asset.processingState === 'queued') return { label: 'Queued for processing', message: 'The uploaded video is queued at Cloudflare. Its status is checked automatically while this page is open.' };
  if (asset.processingState === 'downloading') return { label: 'Receiving video', message: 'Cloudflare is still receiving the video file.' };
  if (asset.processingState === 'inprogress') return { label: `Processing video${typeof asset.processingPercent === 'number' ? ` · ${Math.round(asset.processingPercent)}%` : ''}`, message: 'Cloudflare is converting the uploaded video for playback. Its status is checked automatically.' };
  return { label: 'Checking video status', message: 'The upload is registered. We are checking whether the file has arrived and is ready to play.' };
}
