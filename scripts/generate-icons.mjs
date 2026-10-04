// One-off PWA icon generator: a ring that is mostly drawn (a timer arc)
// with a small gap, accent on dark. Re-run with `npm run icons`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BG = '#1c1b19';
const ARC = '#ff6b4a';
const TRACK = '#3a3835';

function iconSvg({ size, scale = 1 }) {
  const c = size / 2;
  const r = size * 0.28 * scale;
  const sw = size * 0.09 * scale;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.72;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BG}" />
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${sw}" />
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${ARC}" stroke-width="${sw}"
      stroke-linecap="round" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${c} ${c})" />
  </svg>`;
}

async function render(name, size, opts = {}) {
  await sharp(Buffer.from(iconSvg({ size, ...opts }))).png().toFile(path.join(OUT_DIR, name));
  console.log(`icons: wrote ${name} (${size}x${size})`);
}

await render('icon192.png', 192);
await render('icon512.png', 512);
await render('iconMaskable512.png', 512, { scale: 0.78 });
await render('apple-touch-icon.png', 180);
await render('favicon.png', 64);
fs.copyFileSync(path.join(OUT_DIR, 'favicon.png'), path.join(OUT_DIR, 'favicon.ico'));
console.log('icons: done.');
