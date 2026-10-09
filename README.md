# woTask

A task manager that puts your work in space. Each project, goal or category becomes its own
constellation, and every task is a glass sphere floating inside it — sized and lit by priority,
coloured by the space it belongs to, and linked to whatever has to happen first.

Offline, local-first, and a single portable `.exe` on Windows. No account, no sync, no telemetry.
Nothing ever leaves your machine.

![woTask showing the Product Launch space, with a selected task and two blocked tasks waiting on it](docs/images/hero.png)

---

## Why

Most task managers are lists. Lists are good at order and bad at shape — you cannot see that four
things are waiting on one decision, or that a project is top-heavy with urgent work, without reading
every row.

woTask trades the list for a spatial layout where those facts are visible at a glance:

- **Hue** tells you which space a task belongs to — and nothing else ever uses colour, except one
  alert red for overdue.
- **Size, brightness and surface** tell you its priority. The ordering survives in greyscale.
- **Position** tells you its order, and chained tasks wind outward from the centre as a visible
  sequence.
- **A frosted, caged sphere** is a task that is not your turn yet.

## Features

- **Spaces** — projects, goals and categories, each a zone of space with its own hue. Goals show a
  progress arc and a target date.
- **Chained tasks** — say that B comes after A. Chains branch, so finishing one task can release
  several. A blocked task is visibly locked, and completing one out of turn asks first rather than
  refusing.
- **Quick capture** — type `Pay rent !3 #bills`; the bar shows you what it parsed as you type.
- **Command palette** — `Ctrl+K` searches tasks, spaces and commands with fuzzy matching.
- **Full keyboard control** — every action has a shortcut, listed under `?`.
- **Undo** — `Ctrl+Z` on every change, including deleting a whole space.
- **Bangla and English** throughout, with IME-safe text entry.
- **Honest performance** — the canvas renders on demand, so an idle or unfocused window issues zero
  draw calls. Three graphics tiers for weaker GPUs.
- **Respects `prefers-reduced-motion`** — all motion stops, nothing breaks.

### Chains

![A 14-step chain winding around its hub, with one step overdue and one completed out of order](docs/images/chain.png)

A chain lays itself out as a necklace around the space's hub. Direction is carried by the chevrons
and by a gradient that is bright at the blocker and fades toward whatever is waiting. Press `L` on a
task to choose what it comes after.

## Running it

**Prerequisites**

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+
- [Rust](https://rustup.rs/) (stable) — only needed to build the desktop app
- Windows: the Microsoft Edge **WebView2 Runtime**, which ships with Windows 11 and recent Windows 10.
  woTask tells you if it is missing.

**In the browser, for development**

```bash
npm install
npm run dev          # http://localhost:1420
```

Data goes to `localStorage`, and a demo workspace is seeded automatically.

**As the desktop app**

```bash
npm run tauri dev    # development, with hot reload
npm run tauri build  # release build
```

The release binary lands at `src-tauri/target/release/wotask.exe`. Installer bundling is off by
design (`bundle.active: false` in `src-tauri/tauri.conf.json`) — the executable is meant to be
copied and run.

## Where your data lives

SQLite, next to the executable, in a folder called `woTask-data`. Put woTask on a USB stick and your
tasks travel with it.

If that directory is not writable — installed under `C:\Program Files`, say — it falls back to
`%APPDATA%\woTask`. Settings → Data location shows the path actually in use.

The schema is versioned and migrated on launch. Every migration backs the database up beside itself
first (`wotask.db.v2.bak`) and rolls back if anything fails its integrity check.

## Keyboard

| | |
|---|---|
| `N` | New task |
| `Space` | Complete / reopen |
| `Enter` | Open details |
| `L` | Chain after… |
| `P` | Cycle priority |
| `Del` | Delete (undoable) |
| `↑` `↓` | Select previous / next |
| `Alt+↑` `Alt+↓` | Move among siblings, carrying the subtree |
| `Ctrl+←` `Ctrl+→` | Previous / next space |
| `Ctrl+1`…`9` | Jump to a space |
| `Ctrl+Shift+N` | New space |
| `Ctrl+Z` | Undo |
| `H` | Show / hide completed |
| `Ctrl+K` | Command palette |
| `Ctrl+,` | Settings |
| `?` | All shortcuts |

Drag to pan, scroll to zoom, double-click a sphere to open it, click a hub to switch space.

## Project layout

```
src/
  contracts/   Types, zod schemas and every design token. Treated as frozen.
  data/        Persistence. The only place the storage format is spoken.
  state/       One zustand store, plus pure selectors.
  scene/       React Three Fiber. Renders props; never reads the store.
  ui/          DOM chrome. All text and text entry lives here, never in WebGL.
  shared/      Formatting used by both layers.
src-tauri/     Rust: SQLite, migrations, window controls.
scripts/       Test and audit scripts (plain Node, no test framework).
docs/          Design notes.
```

Two rules shape most of this. Colours, motion timings and material parameters come only from
`src/contracts/tokens.ts`, so nothing is tuned in two places. And `src/scene/` never imports from
`src/data/` or `src/state/` — `src/app/App.tsx` is the single point where the store meets the scene.

For the reasoning behind the visual language — why priority avoids colour, how spheres are placed,
how chains are laid out and which two layouts failed first — see
[docs/SPHERE_DESIGN.md](docs/SPHERE_DESIGN.md).

## Development

```bash
npm run build          # tsc --noEmit + Vite build
npm run typecheck
npm run audit:offline  # fails if the frontend could reach the network
npm run test:chain     # unit tests for the chain and ordering selectors
npm run test:palette   # guards the space palette against drift
npm run test:ui        # end-to-end; needs `npm run dev` running
npm run test:visual    # pixel-level checks; needs `npm run dev` running
cd src-tauri && cargo test && cargo check
```

The browser tests drive the system's Edge through `playwright-core`, so there is no browser download
and the suite stays offline like the app.

**Dev fixtures.** Append `?seed=<name>` in development to load an isolated workspace:
`demo`, `none`, `priorities`, `states`, `dense60`, `reorder`, `many`, `chains`, `forks`,
`lockedDeep`, `stress`. Each uses its own storage slot, so it never touches your real data.

## Offline, for real

`npm run audit:offline` fails the build if anything in the shipped frontend could reach the network.
There are no CDN links, no remote fonts, no HDRI environment maps and no remote decoders: the Inter
font is bundled, the lighting is baked from mesh lights at runtime, and every texture is drawn
procedurally. The Tauri security policy allows no outbound connections, and the end-to-end test
asserts that a full session makes zero external requests.

## Status

Version 0.1.0, and a personal project rather than a product. It works and it is tested, but the
contracts are still moving. Windows is the only platform currently built and tested.

## License

No licence has been chosen yet, which means default copyright applies: the code is public to read,
but not yet licensed for reuse. If you want to use any of it, open an issue and ask.
