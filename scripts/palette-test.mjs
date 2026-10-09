// Guards the region palette against drift: every hue must sit near the group's mean OKLCH lightness
// and chroma, and hues must be spread around the wheel. Usage: npm run test:palette
import { readFileSync } from 'node:fs';
import { converter } from 'culori';

const MAX_L_DEV = 0.04;
const MAX_C_DEV = 0.03;
/** Largest empty arc allowed between neighbouring hues, and smallest separation, in degrees. */
const MAX_HUE_GAP = 95;
const MIN_HUE_GAP = 14;

const src = readFileSync(new URL('../src/contracts/tokens.ts', import.meta.url), 'utf8');
const block = /regionHues:\s*\[([^\]]+)\]/.exec(src);
if (!block) throw new Error('PALETTE.regionHues not found in tokens.ts');
const hexes = [...block[1].matchAll(/'(#[0-9a-fA-F]{6})'/g)].map((m) => m[1]);

const oklch = converter('oklch');
const rows = hexes.map((hex) => {
  const c = oklch(hex);
  return { hex, l: c.l, c: c.c, h: c.h ?? 0 };
});
const meanL = rows.reduce((s, r) => s + r.l, 0) / rows.length;
const meanC = rows.reduce((s, r) => s + r.c, 0) / rows.length;

let failures = 0;
const fail = (msg) => {
  console.log(`FAIL  ${msg}`);
  failures++;
};

console.log(`mean L ${meanL.toFixed(3)}  mean C ${meanC.toFixed(3)}`);
for (const r of rows) {
  const dl = r.l - meanL;
  const dc = r.c - meanC;
  console.log(`${r.hex}  L ${r.l.toFixed(3)} (${dl >= 0 ? '+' : ''}${dl.toFixed(3)})  C ${r.c.toFixed(3)} (${dc >= 0 ? '+' : ''}${dc.toFixed(3)})  h ${r.h.toFixed(1)}`);
  if (Math.abs(dl) > MAX_L_DEV) fail(`${r.hex} lightness is ${dl.toFixed(3)} from the mean (limit ${MAX_L_DEV})`);
  if (Math.abs(dc) > MAX_C_DEV) fail(`${r.hex} chroma is ${dc.toFixed(3)} from the mean (limit ${MAX_C_DEV})`);
}

if (hexes.length !== 8) fail(`expected 8 region hues, found ${hexes.length}`);
const hues = rows.map((r) => r.h).sort((a, b) => a - b);
const gaps = hues.map((h, i) => (i === hues.length - 1 ? hues[0] + 360 - h : hues[i + 1] - h));
const maxGap = Math.max(...gaps);
const minGap = Math.min(...gaps);
console.log(`hue gaps: ${gaps.map((g) => g.toFixed(0)).join(', ')}`);
if (maxGap > MAX_HUE_GAP) fail(`largest hue gap ${maxGap.toFixed(1)}° exceeds ${MAX_HUE_GAP}°`);
if (minGap < MIN_HUE_GAP) fail(`two hues are only ${minGap.toFixed(1)}° apart (minimum ${MIN_HUE_GAP}°)`);

console.log(failures ? `\n${failures} palette check(s) failed` : '\nPalette checks passed');
process.exit(failures ? 1 : 0);
