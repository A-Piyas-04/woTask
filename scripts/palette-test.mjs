// Guards the region palette against drift: stored indices must keep their colour, every hue must stay in
// the lightness/chroma band that reads well as glass under bloom, and every pair must be perceptually
// distinct. Usage: npm run test:palette
import { readFileSync } from 'node:fs';
import { converter, differenceEuclidean } from 'culori';

/** Regions store an index into the palette; these entries can never change or move. */
const FROZEN = ['#7490BD', '#5F9E8F', '#C09562', '#B57D8E', '#8E83BC', '#6B9DB0', '#B9796B', '#8EA06E'];
const MIN_COUNT = 24;
const L_RANGE = [0.58, 0.78];
const C_RANGE = [0.05, 0.14];
/** Smallest OKLab distance allowed between any two entries (the original set's closest pair is ~0.047). */
const MIN_DISTANCE = 0.045;

const src = readFileSync(new URL('../src/contracts/tokens.ts', import.meta.url), 'utf8');
const block = /regionHues:\s*\[([^\]]+)\]/.exec(src);
if (!block) throw new Error('PALETTE.regionHues not found in tokens.ts');
const hexes = [...block[1].matchAll(/'(#[0-9a-fA-F]{6})'/g)].map((m) => m[1].toUpperCase());

const oklch = converter('oklch');
const distance = differenceEuclidean('oklab');

let failures = 0;
const fail = (msg) => {
  console.log(`FAIL  ${msg}`);
  failures++;
};

if (hexes.length < MIN_COUNT) fail(`expected at least ${MIN_COUNT} region hues, found ${hexes.length}`);
FROZEN.forEach((hex, i) => {
  if (hexes[i] !== hex) fail(`index ${i} must stay ${hex} (stored regions refer to it), found ${hexes[i]}`);
});
if (new Set(hexes).size !== hexes.length) fail('palette contains duplicates');

for (const hex of hexes) {
  const c = oklch(hex);
  console.log(`${hex}  L ${c.l.toFixed(3)}  C ${c.c.toFixed(3)}  h ${(c.h ?? 0).toFixed(1)}`);
  if (c.l < L_RANGE[0] || c.l > L_RANGE[1]) fail(`${hex} lightness ${c.l.toFixed(3)} outside ${L_RANGE.join('–')}`);
  if (c.c < C_RANGE[0] || c.c > C_RANGE[1]) fail(`${hex} chroma ${c.c.toFixed(3)} outside ${C_RANGE.join('–')}`);
}

let closest = { d: Infinity, a: '', b: '' };
for (let i = 0; i < hexes.length; i++) {
  for (let j = i + 1; j < hexes.length; j++) {
    const d = distance(hexes[i], hexes[j]);
    if (d < closest.d) closest = { d, a: hexes[i], b: hexes[j] };
  }
}
console.log(`closest pair: ${closest.a} / ${closest.b}  ΔE(OKLab) ${closest.d.toFixed(3)}`);
if (closest.d < MIN_DISTANCE) fail(`${closest.a} and ${closest.b} are too similar (${closest.d.toFixed(3)} < ${MIN_DISTANCE})`);

console.log(failures ? `\n${failures} palette check(s) failed` : '\nPalette checks passed');
process.exit(failures ? 1 : 0);
