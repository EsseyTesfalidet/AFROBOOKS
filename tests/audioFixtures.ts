export async function recording(seconds: number) {
  const { Mp3Encoder } = await import('@breezystack/lamejs'); const encoder = new Mp3Encoder(1, 22050, 128);
  const chunks: Buffer[] = []; const total = Math.floor(seconds * 22050);
  for (let start = 0; start < total; start += 1152) {
    const pcm = Int16Array.from({ length: Math.min(1152, total - start) }, (_, i) => Math.round(Math.sin((start + i) * 440 * Math.PI * 2 / 22050) * 8000));
    chunks.push(Buffer.from(encoder.encodeBuffer(pcm)));
  }
  chunks.push(Buffer.from(encoder.flush())); return Buffer.concat(chunks);
}
