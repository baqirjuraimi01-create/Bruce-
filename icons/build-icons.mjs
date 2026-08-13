/* ------------------------------------------------------------------
   Regenerates the app icons.  Run: npm run icons

   The mark is the app's own calorie donut — an ink field, a muted
   track ring, a lime arc — with a barbell across the middle so it
   reads as lifting rather than generic activity. The barbell is two
   plates, not four: at launcher sizes a second pair of plates blurs
   into the ring and the whole thing turns to mush.

   Rendered through Chromium so the curves are properly anti-aliased,
   then written out at the sizes iOS, Android and the browser want.
------------------------------------------------------------------- */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* palette lifted straight from css/styles.css */
const INK   = '#26282c';   // --ink
const TRACK = '#3c4046';   // the ring behind the arc
const LIME  = '#c2e34f';   // --lime
const BAR   = '#f2f3f5';   // near-white, matches --card on ink

const R = 150, STROKE = 46, C = 2 * Math.PI * R;
const FILL = 0.68;                       // how far the lime arc travels
const arc = C * FILL, rest = C - arc;

/* `rounded` adds a squircle-ish corner: right for a browser tab,
   wrong for a maskable app icon, which must bleed to the edges. */
const svg = (size, rounded) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${INK}"/>
  <g transform="rotate(-90 256 256)">
    <circle cx="256" cy="256" r="${R}" fill="none" stroke="${TRACK}" stroke-width="${STROKE}"/>
    <circle cx="256" cy="256" r="${R}" fill="none" stroke="${LIME}" stroke-width="${STROKE}"
            stroke-linecap="round" stroke-dasharray="${arc.toFixed(2)} ${rest.toFixed(2)}"/>
  </g>
  <g fill="${BAR}">
    <rect x="192" y="245" width="128" height="22" rx="11"/>
    <rect x="168" y="220" width="22" height="72" rx="11"/>
    <rect x="322" y="220" width="22" height="72" rx="11"/>
  </g>
</svg>`.trim();

/* The SVG favicon is the crispest option in a browser tab. */
writeFileSync(join(HERE, 'icon.svg'), svg(512, true) + '\n');

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox']
});

const shoot = async (size, rounded, name) => {
  const page = await browser.newPage({ viewport:{ width:size, height:size }, deviceScaleFactor:1 });
  await page.setContent(
    `<body style="margin:0;background:${INK}">${svg(size, rounded)}</body>`,
    { waitUntil:'load' });
  await page.screenshot({ path: join(HERE, name), omitBackground: false });
  await page.close();
  console.log('  wrote', name, `(${size}×${size})`);
};

// Android / PWA. Maskable, so the art must survive the OS crop: the
// ring sits well inside the 80% safe circle.
await shoot(512, false, 'icon-512.png');
await shoot(192, false, 'icon-192.png');
// iOS Add to Home Screen. iOS ignores the web manifest and uses this.
await shoot(180, false, 'apple-touch-icon.png');

await browser.close();
console.log('  wrote icon.svg (512×512, rounded)');
