import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// The vector mark is the source for every app icon. The artwork stays inside
// the central safe area so Android can apply circle and squircle masks.
const mark = await readFile(new URL('../public/brand/afrobooks-mark.svg', import.meta.url), 'utf8');
const paths = mark.replace(/<svg[^>]*>/, '').replace('</svg>', '').trim();
const icon = (radius = 0, transform = 'translate(11 12) scale(.65625)') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="${radius}" fill="#101110"/>
  <g transform="${transform}">${paths}</g>
</svg>\n`;

// Browser tabs have no adaptive mask; use more of the tiny 16px canvas.
await writeFile(new URL('../public/favicon.svg', import.meta.url), icon(15, 'translate(3.2 4.5) scale(.9)'));
await Promise.all([
  [192, 'pwa-192x192.png'],
  [512, 'pwa-512x512.png'],
  [180, 'apple-touch-icon.png'],
].map(([size, name]) => sharp(Buffer.from(icon()), { density: 600 })
  .resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)))));

console.log('Generated the favicon and 180px, 192px, and 512px app icons.');
