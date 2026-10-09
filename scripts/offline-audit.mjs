// Fails if anything in the shipped frontend could reach the network.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOTS = ['src', 'index.html', 'public', 'dist'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json']);
const PATTERNS = [
  { re: /https?:\/\/(?!localhost|ipc\.localhost|www\.w3\.org)[^\s'"`)]+/g, why: 'remote URL' },
  { re: /<Environment[^>]*\bpreset=/g, why: 'drei Environment preset (downloads an HDRI)' },
  { re: /fonts\.(googleapis|gstatic)\.com/g, why: 'Google Fonts' },
  { re: /\b(cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare|raw\.githack|gstatic)\b/g, why: 'CDN host' },
];
// Library bundles mention URLs in comments, licences and dead code paths; only flag fetchable ones.
const DIST_ONLY = [/fetch\(\s*["'`]https?:/g, /\bsrc=["']https?:/g, /@import\s+url\(["']?https?:/g];

const files = [];
const walk = (p) => {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (EXTS.has(extname(p))) files.push(p);
};
ROOTS.forEach(walk);

const problems = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(process.cwd(), file);
  const patterns = rel.startsWith('dist') ? DIST_ONLY.map((re) => ({ re, why: 'network fetch in bundle' })) : PATTERNS;
  for (const { re, why } of patterns) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').length;
      problems.push(`${rel}:${line}  ${why}: ${m[0].slice(0, 80)}`);
    }
  }
}

if (problems.length) {
  console.error(`Offline audit FAILED (${problems.length}):\n` + problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Offline audit passed (${files.length} files scanned).`);
