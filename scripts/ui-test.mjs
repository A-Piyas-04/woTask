// End-to-end UI smoke test against `npm run dev`, driving the system Edge via playwright-core.
// Usage: node scripts/ui-test.mjs [url] [screenshotDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:1420/';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
const requests = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.hostname !== 'localhost' && u.protocol !== 'data:' && u.protocol !== 'blob:') requests.push(r.url());
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const titles = () => page.$$eval('.orb-title', (els) => els.map((e) => e.textContent ?? ''));
const settle = (ms = 900) => page.waitForTimeout(ms);

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.orb-title', { timeout: 20000 });
await settle(1500);
await page.screenshot({ path: join(outDir, '01-initial.png') });

const canvas = await page.$eval('canvas', (c) => {
  const r = c.getBoundingClientRect();
  const m = c.closest('.main').getBoundingClientRect();
  return { cw: Math.round(r.width), ch: Math.round(r.height), mw: Math.round(m.width), mh: Math.round(m.height) };
});
check('canvas fills main area', Math.abs(canvas.cw - canvas.mw) <= 1 && Math.abs(canvas.ch - canvas.mh) <= 1, JSON.stringify(canvas));

const initial = await titles();
check('initial labels rendered', initial.length >= 8 && initial.every((t) => t.length > 0), `${initial.length} labels; first="${initial[0]}"`);
check('first task label present', initial.includes('Finalise pricing page copy'));

// Drag the universe around and zoom; labels should move with the scene.
const labelPos = () => page.$eval('.zone-label', (e) => e.getBoundingClientRect().x);
const x0 = await labelPos();
await page.mouse.move(700, 600);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(700 - i * 35, 600 - i * 12);
await page.mouse.up();
await settle(1500);
const x1 = await labelPos();
check('drag pans the scene', Math.abs(x1 - x0) > 100, `${Math.round(x0)} -> ${Math.round(x1)}`);
await page.screenshot({ path: join(outDir, '01b-after-drag.png') });
await page.mouse.wheel(0, 600);
await settle(1200);
await page.screenshot({ path: join(outDir, '01c-zoomed-out.png') });

// Add an English task with quick-add syntax.
await page.keyboard.press('n');
await page.keyboard.type('Ship the 3D task manager !3 #release');
await page.keyboard.press('Enter');
await settle();
let t = await titles();
check('add task via input', t.includes('Ship the 3D task manager'));

// Bangla input
await page.fill('.task-input input', 'নতুন কাজ যোগ করা হলো');
await page.keyboard.press('Enter');
await settle();
t = await titles();
check('add Bangla task', t.includes('নতুন কাজ যোগ করা হলো'));

// Keyboard selection + complete
await page.locator('.task-input input').blur();
await page.keyboard.press('ArrowDown');
await settle(300);
await page.keyboard.press('Space');
await settle();
const doneCount = await page.$$eval('.orb-label.is-done', (e) => e.length);
check('complete via Space', doneCount >= 1, `${doneCount} done`);
await page.screenshot({ path: join(outDir, '02-after-complete.png') });

// Edit panel
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await settle(400);
check('detail panel opens with Enter', (await page.$('.detail-panel')) !== null);
await page.screenshot({ path: join(outDir, '03-detail.png') });
await page.keyboard.press('Escape'); // blur title input
await page.keyboard.press('Escape'); // close panel
await settle(300);
check('detail panel closes with Esc', (await page.$('.detail-panel')) === null);

// Delete + undo
const before = (await titles()).length;
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Delete');
await settle();
const afterDelete = (await titles()).length;
check('delete via Del', afterDelete === before - 1, `${before} -> ${afterDelete}`);
check('undo toast shown', (await page.$('.toast-action')) !== null);
await page.keyboard.press('Control+z');
await settle();
check('undo restores task', (await titles()).length === before);

// Command palette
await page.keyboard.press('Control+k');
await settle(300);
check('palette opens with Ctrl+K', (await page.$('.palette')) !== null);
await page.keyboard.type('pricing');
await settle(200);
const firstHit = await page.$eval('.palette-item.is-active .palette-title', (e) => e.textContent);
check('palette fuzzy search', firstHit?.includes('pricing') ?? false, String(firstHit));
await page.screenshot({ path: join(outDir, '04-palette.png') });
await page.keyboard.press('Enter');
await settle(300);
check('palette closes on Enter', (await page.$('.palette')) === null);

// Switch region by keyboard (display order: projects, goals, categories)
const activeRegion = () => page.$eval('.region-row.is-active .region-name', (e) => e.textContent);
await page.keyboard.press('Control+2');
await settle();
check('Ctrl+2 switches region', (await activeRegion()) === 'Health', String(await activeRegion()));
await page.keyboard.press('Control+ArrowRight');
await settle(300);
check('Ctrl+Right cycles region', (await activeRegion()) === 'পড়াশোনা', String(await activeRegion()));
await page.keyboard.press('Control+ArrowLeft');
await settle(300);
await page.screenshot({ path: join(outDir, '05-health-region.png') });

// Priority cycling and show/hide completed
await page.keyboard.press('ArrowDown');
await settle(200);
const selTitle = await page.$eval('.orb-label.is-selected .orb-title', (e) => e.textContent);
await page.keyboard.press('p');
await settle(300);
check('P cycles priority', selTitle !== null);
const doneBefore = await page.$$eval('.orb-label.is-done', (e) => e.length);
await page.keyboard.press('h');
await settle(600);
const doneHidden = await page.$$eval('.orb-label.is-done', (e) => e.length);
await page.keyboard.press('h');
await settle(600);
check('H hides completed tasks', doneBefore > 0 && doneHidden === 0, `${doneBefore} -> ${doneHidden}`);
await page.keyboard.press('Escape');

// Shortcuts overlay
await page.keyboard.press('Shift+Slash');
await settle(200);
check('? opens shortcuts overlay', (await page.$('.shortcuts')) !== null);
await page.screenshot({ path: join(outDir, '05b-shortcuts.png') });
await page.keyboard.press('Escape');
await settle(200);
check('Esc closes shortcuts overlay', (await page.$('.shortcuts')) === null);

// New region via Ctrl+Shift+N
await page.keyboard.press('Control+Shift+N');
await settle(300);
await page.keyboard.type('Garden');
await page.keyboard.press('Enter');
await settle(600);
check('Ctrl+Shift+N creates region', (await activeRegion()) === 'Garden', String(await activeRegion()));
const placeholder = await page.$eval('.task-input input', (e) => e.getAttribute('placeholder'));
check('quick capture targets active region', placeholder?.startsWith('Add a task to Garden') ?? false, String(placeholder));

// Persistence across reload
await page.reload();
await page.waitForSelector('.orb-title');
await page.click('.region-row:has-text("Product Launch")');
await settle(1200);
t = await titles();
check('data persists across reload', t.includes('Ship the 3D task manager') && t.includes('নতুন কাজ যোগ করা হলো'));

// Settings
await page.keyboard.press('Control+,');
await settle(300);
check('settings opens', (await page.$('.settings')) !== null);
await page.screenshot({ path: join(outDir, '06-settings.png') });
await page.keyboard.press('Escape');

// Guard: the last region cannot be deleted.
await page.goto(`${url}?seed=states`);
await page.waitForSelector('.region-row');
await page.click('.region-row-wrap .region-action[title="Delete region"]', { force: true });
await settle(300);
const notice = await page.$('.inline-notice');
check('deleting the last region is blocked with an explanation', notice !== null && (await page.$$eval('.region-row', (e) => e.length)) === 1);

// Onboarding on an empty database.
await page.goto(`${url}?seed=none`);
await page.waitForSelector('.onboarding');
check('onboarding card shown on first run', (await page.$('.app-body')) === null);
await page.screenshot({ path: join(outDir, '07-onboarding.png') });
await page.fill('.onboarding input[aria-label="Region name"]', 'Thesis');
await page.keyboard.press('Enter');
await page.waitForSelector('.region-row', { timeout: 5000 }).catch(() => null);
check('creating the first region dismisses onboarding', (await page.$('.onboarding')) === null && (await activeRegion()) === 'Thesis');

check('no network requests', requests.length === 0, requests.slice(0, 3).join(', '));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
