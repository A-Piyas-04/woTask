// Visual acceptance checks against `npm run dev`, driving the system Edge via playwright-core.
// Writes screenshots to docs/screenshots/ and asserts: no clipped cores, priority luminance ordering,
// no overlapping visible labels, zone titles inside the frame, and a static scene under reduced motion.
// Usage: node scripts/visual-test.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const base = positional[0] ?? 'http://localhost:1420/';
const outDir = positional[1] ?? 'docs/screenshots';
mkdirSync(outDir, { recursive: true });

const CLIP_LIMIT = 0.0005; // fraction of scene pixels allowed above 250 on every channel
const MIN_LUMA_GAP = 4; // 0–255 luma between adjacent priority cores
const TITLE_ROOM = 24 - 4; // CHROME.titleClearancePx with a little tolerance for damping

// Hardware GPU via ANGLE/D3D11 so the stress fps is meaningful; pass --swiftshader to force software.
const software = process.argv.includes('--swiftshader');
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: software
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const viewport = { width: 1280, height: 800 };
const lab = await browser.newPage();

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const info = (name, detail) => console.log(`INFO  ${name}  (${detail})`);

/** Runs a pixel analysis on a PNG buffer inside a blank page (no image deps needed). */
async function analyze(buf, kind, arg = null) {
  return lab.evaluate(
    async ({ b64, kind, arg }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const luma = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (kind === 'clip') {
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let hot = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) hot++;
        return hot / (data.length / 4);
      }
      if (kind === 'peaks') {
        // Mean of the brightest 40 pixels in each box: a stable proxy for the core's peak.
        return arg.map((b) => {
          const x = Math.max(0, Math.round(b.x));
          const y = Math.max(0, Math.round(b.y));
          const w = Math.min(c.width - x, Math.round(b.w));
          const h = Math.min(c.height - y, Math.round(b.h));
          const { data } = ctx.getImageData(x, y, w, h);
          const ls = [];
          for (let i = 0; i < data.length; i += 4) ls.push(luma(data, i));
          ls.sort((a, b2) => b2 - a);
          const top = ls.slice(0, 40);
          return top.reduce((s, v) => s + v, 0) / top.length;
        });
      }
      if (kind === 'diff') {
        const other = new Image();
        other.src = `data:image/png;base64,${arg}`;
        await other.decode();
        const a = ctx.getImageData(0, 0, c.width, c.height).data;
        ctx.drawImage(other, 0, 0);
        const b = ctx.getImageData(0, 0, c.width, c.height).data;
        let changed = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) changed++;
        }
        return changed / (a.length / 4);
      }
      return null;
    },
    { b64: buf.toString('base64'), kind, arg },
  );
}

async function open(query, { reducedMotion = 'reduce' } = {}) {
  const page = await browser.newPage({ viewport, reducedMotion });
  page.on('pageerror', (e) => console.log(`  pageerror: ${e}`));
  await page.addInitScript(() => {
    window.__draws = 0;
    const P = WebGL2RenderingContext.prototype;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = P[name];
      P[name] = function (...args) {
        window.__draws++;
        return orig.apply(this, args);
      };
    }
  });
  await page.goto(`${base}?${query}`);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(2500);
  return page;
}

const mainClip = (page) =>
  page.$eval('.main', (m) => {
    const r = m.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

const shot = async (page, name, opts = {}) => {
  const buf = await page.screenshot({ path: join(outDir, name), ...opts });
  return buf;
};

// 1. Four-region universe.
{
  const page = await open('seed=demo');
  const titleRoom = () =>
    page.evaluate(() => {
      const main = document.querySelector('.main').getBoundingClientRect();
      const z = document.querySelector('.zone-label.is-active')?.getBoundingClientRect();
      return z ? Math.round(z.top - main.top) : -1;
    });
  const room = await titleRoom();
  check('focused zone title clears the top edge', room >= TITLE_ROOM, `${room}px from top`);
  await page.keyboard.press('Control+2');
  await page.waitForTimeout(2200);
  const room2 = await titleRoom();
  check('goal zone title clears the top edge after Ctrl+2', room2 >= TITLE_ROOM, `${room2}px from top`);
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(2200);

  await page.mouse.move(760, 420);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 200);
  await page.waitForTimeout(1500);
  // Pan so the centre of all zone titles sits in the middle of the canvas (slow release: no momentum).
  const pan = await page.evaluate(() => {
    const main = document.querySelector('.main').getBoundingClientRect();
    const rs = [...document.querySelectorAll('.zone-label')].map((e) => e.getBoundingClientRect());
    const xs = rs.map((r) => r.x + r.width / 2);
    const ys = rs.map((r) => r.y + r.height / 2);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 40;
    return { dx: main.x + main.width / 2 - cx, dy: main.y + main.height / 2 - cy };
  });
  await page.mouse.move(700, 400);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(700 + (pan.dx * i) / 12, 400 + (pan.dy * i) / 12);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(2000);
  await shot(page, '01-universe.png');
  const zones = await page.$$eval('.zone-name', (els) => els.map((e) => e.textContent));
  check('universe shows four regions', zones.length === 4, zones.join(', '));

  // 2. Zoomed into one region.
  await page.click('.region-row >> text=Product Launch');
  await page.waitForTimeout(400);
  await page.mouse.move(760, 420);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -160);
  await page.waitForTimeout(2500);
  await shot(page, '02-region-zoomed.png');
  const visibleLabels = await page.$$eval('.orb-label[data-visible="true"]', (els) => els.length);
  check('zoomed region shows task labels', visibleLabels >= 3, `${visibleLabels} visible`);

  // Clipping check on the whole universe without DOM text.
  const off = await open('seed=demo&labels=off');
  const buf = await off.screenshot({ clip: await mainClip(off) });
  const hot = await analyze(buf, 'clip');
  check('universe: no core clips to white', hot < CLIP_LIMIT, `${(hot * 100).toFixed(3)}% pixels > 250`);
  await off.close();
  await page.close();
}

// 3/4. Four priorities in colour and grayscale; luminance must rise with priority.
{
  const page = await open('seed=priorities');
  await shot(page, '03-priorities.png');
  const boxes = await page.$$eval('.orb-label', (els) =>
    els
      .map((e) => {
        const r = e.getBoundingClientRect();
        const t = e.querySelector('.orb-title')?.textContent ?? '';
        // The orb sits directly above its label; search a column above the title.
        return { t, x: r.x + r.width / 2 - 45, y: r.y - 150, w: 90, h: 150 };
      })
      .filter((b) => /^Priority \d$/.test(b.t))
      .sort((a, b) => a.t.localeCompare(b.t)),
  );
  const hide = await page.addStyleTag({ content: '.scene-root .label-layer{display:none}' });
  await page.waitForTimeout(300);
  const raw = await page.screenshot();
  const peaks = await analyze(raw, 'peaks', boxes);
  const ordered = peaks.every((v, i) => i === 0 || v - peaks[i - 1] >= MIN_LUMA_GAP);
  check(
    'priority luminance rises P0 < P1 < P2 < P3',
    boxes.length === 4 && ordered,
    boxes.map((b, i) => `${b.t.slice(-2)}=${peaks[i]?.toFixed(0)}`).join(' '),
  );
  const hot = await analyze(await page.screenshot({ clip: await mainClip(page) }), 'clip');
  check('priorities: P3 core does not clip', hot < CLIP_LIMIT, `${(hot * 100).toFixed(3)}% pixels > 250`);
  await hide.evaluate((e) => e.remove());
  await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
  await page.waitForTimeout(300);
  await shot(page, '04-priorities-grayscale.png');
  await page.close();
}

// 5. Completed + overdue pair.
{
  const page = await open('seed=states');
  await page.mouse.move(760, 420);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -160);
  await page.waitForTimeout(2000);
  await shot(page, '05-completed-overdue.png');
  await page.close();
}

// Dense region: visible labels never overlap.
{
  const page = await open('seed=dense60');
  await page.mouse.move(760, 420);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -160);
  await page.waitForTimeout(2500);
  await shot(page, '06-dense-labels.png');
  const res = await page.$$eval('.orb-label[data-visible="true"]', (els) => {
    const rs = els.map((e) => e.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) overlaps++;
      }
    }
    return { visible: rs.length, overlaps };
  });
  check('dense region labels do not overlap', res.overlaps === 0 && res.visible > 0, JSON.stringify(res));
  await page.close();
}

// Reduced motion: the scene is static (no float, breathing or drift).
{
  const page = await open('seed=demo');
  const clip = await mainClip(page);
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(1500);
  const b = await page.screenshot({ clip });
  const changed = await analyze(a, 'diff', b.toString('base64'));
  check('reduced motion: scene is static', changed < 0.001, `${(changed * 100).toFixed(3)}% pixels changed`);
  await page.close();
}

// Ambient motion on: the scene does animate (sanity check for the diff above).
{
  const page = await open('seed=demo', { reducedMotion: 'no-preference' });
  const clip = await mainClip(page);
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(1500);
  const b = await page.screenshot({ clip });
  const changed = await analyze(a, 'diff', b.toString('base64'));
  check('ambient motion: scene moves', changed > 0.001, `${(changed * 100).toFixed(3)}% pixels changed`);

  // Unfocused window: the canvas drops to on-demand rendering, so nothing is drawn while idle.
  const drawsOver = async (ms) => {
    const d0 = await page.evaluate(() => window.__draws);
    await page.waitForTimeout(ms);
    return (await page.evaluate(() => window.__draws)) - d0;
  };
  const focused = await drawsOver(1000);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  // Spheres glide back to rest (finite damping) before the canvas goes fully idle.
  await page.waitForTimeout(4000);
  const idle = await drawsOver(2000);
  check('idle when unfocused: no draws', idle === 0, `${focused} draw calls/s focused, ${idle} in 2s unfocused`);
  await page.close();
}

// Reduced motion with the window focused: no continuous rendering either.
{
  const page = await open('seed=demo');
  await page.waitForTimeout(1000);
  const d0 = await page.evaluate(() => window.__draws);
  await page.waitForTimeout(2000);
  const idle = (await page.evaluate(() => window.__draws)) - d0;
  check('reduced motion: no continuous rendering', idle === 0, `${idle} draws in 2s`);
  await page.close();
}

// Stress: 500 tasks with ambient motion on (continuous rendering). Informational: headless rAF timing
// on this machine's GPU, not the target hardware.
{
  const page = await open('seed=stress', { reducedMotion: 'no-preference' });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'none';
  });
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else resolve((n * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(tick);
      }),
  );
  const orbs = await page.$$eval('.region-count', (els) => els.reduce((s, e) => s + Number(e.textContent), 0));
  info('stress fps', `${fps.toFixed(1)} fps with ${orbs} tasks on ${renderer}`);
  await shot(page, '07-stress.png');
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll visual checks passed');
process.exit(failures ? 1 : 0);
