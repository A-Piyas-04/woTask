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
const titles = () => page.$$eval('.card-title', (els) => els.map((e) => e.textContent ?? ''));
const settle = (ms = 900) => page.waitForTimeout(ms);

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.card-title', { timeout: 20000 });
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
check('first task label present', initial.includes('Reply to Rahim about the weekend trip'));

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
const doneCount = await page.$$eval('.card-label.is-done', (e) => e.length);
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
await page.keyboard.type('passport');
await settle(200);
const firstHit = await page.$eval('.palette-item.is-active .palette-title', (e) => e.textContent);
check('palette fuzzy search', firstHit?.includes('passport') ?? false, String(firstHit));
await page.screenshot({ path: join(outDir, '04-palette.png') });
await page.keyboard.press('Enter');
await settle(300);
check('palette closes on Enter', (await page.$('.palette')) === null);

// Switch list by keyboard
await page.keyboard.press('Control+2');
await settle();
const listName = await page.$eval('.list-item.is-active .list-name', (e) => e.textContent);
check('Ctrl+2 switches list', listName === 'Work', String(listName));
await page.screenshot({ path: join(outDir, '05-work-list.png') });

// Persistence across reload
await page.reload();
await page.waitForSelector('.card-title');
await page.keyboard.press('Control+1');
await settle(1200);
t = await titles();
check('data persists across reload', t.includes('Ship the 3D task manager') && t.includes('নতুন কাজ যোগ করা হলো'));

// Settings
await page.keyboard.press('Control+,');
await settle(300);
check('settings opens', (await page.$('.settings')) !== null);
await page.screenshot({ path: join(outDir, '06-settings.png') });
await page.keyboard.press('Escape');

check('no network requests', requests.length === 0, requests.slice(0, 3).join(', '));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
