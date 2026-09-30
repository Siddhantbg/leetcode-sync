// Generates square 16/48/128 PNG icons from a source image by center-cropping
// to a square (cover) and resizing. Run with: node scripts/make-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src =
  process.env.ICON_SRC ??
  'C:/Users/Siddhant Bhagat/.cursor/projects/d-Resume-projects-Leetcode-sync/assets/icon128.png';
const outDir = resolve(here, '../src/assets');

for (const size of [16, 48, 128]) {
  const out = resolve(outDir, `icon${size}.png`);
  await sharp(src)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(out);
  console.log('wrote', out);
}
