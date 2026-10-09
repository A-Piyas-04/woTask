# woTask

A task manager that puts your work in space. Each project, goal or category becomes its own
constellation, and every task is a glass sphere floating inside it — sized and lit by priority,
coloured by the space it belongs to, and linked to whatever has to happen first.

Offline, local-first, and a single portable `.exe` on Windows. No account, no sync, no telemetry.
Nothing ever leaves your machine.

![woTask showing the Product Launch space, with a selected task and two blocked tasks waiting on it](docs/images/hero.png)

---

## Download and use (Windows)

### Check the release assets first

1. Open [GitHub Releases](https://github.com/A-Piyas-04/woTask/releases/latest).
2. Expand **Assets** at the bottom of the release.
3. Look for a Windows `.exe` or `woTask-<version>-windows-x64.zip`.

**If you only see “Source code (zip)” and “Source code (tar.gz)”, the runnable app has not
been attached to that release yet.** This is the state shown for the release titled `v1.0`
(tag `mark1`) before the portable files are uploaded. A published release does not automatically
include a built app; the maintainer must attach it using the steps below.

| Download | What it contains | For regular users? |
|---|---|---|
| `woTask-<version>-windows-x64.exe` | Finished portable app | **Yes** — download and double-click |
| `woTask-<version>-windows-x64.zip` | The same app, named `wotask.exe`, inside a ZIP | **Yes** — extract, then double-click |
| `SHA256SUMS.txt` | Checksums for verifying the downloads | Optional |
| `Source code (zip)` / `Source code (tar.gz)` | Project source files | No — these require a developer build |

### Start using the app

Once the portable assets are available:

1. Download the Windows `.zip` asset.
2. Extract it to a writable folder, such as a folder on your Desktop.
3. Double-click `wotask.exe`.
4. Start using woTask. Your data is saved locally.

Alternatively, download the `.exe` asset directly, put it in your chosen folder, and double-click it.

- **No terminal or build commands.**
- **No Node.js or Rust required.**
- **No installation wizard or first-launch build.**
- **No account or internet connection needed to use the app.**

### Requirements

- **64-bit Windows.**
- **Microsoft Edge WebView2 Runtime already installed.** It is commonly present on Windows 10 and 11.
- WebView2 is not bundled or downloaded by woTask. If it is missing, the app explains that you must
  install it before opening woTask.

GitHub's **Code → Download ZIP** also downloads source files, not the runnable app.

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

- Tasks in a chain form a necklace around the space's hub.
- Chevrons and a brightness gradient show the direction from blocker to successor.
- Press `L` on a task to choose what it comes after.

## Running from source (developers)

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

### Packaging a portable release (maintainers)

**1. Build the package on Windows.**

With the project dependencies and Windows Rust/C++ build tools already installed, run:

```bash
npm run release:portable
```

The command builds the Windows x64 EXE, runs the offline audit, and creates these files
(the current app version is `0.1.0`):

```text
release/
  woTask-0.1.0-windows-x64.exe
  woTask-0.1.0-windows-x64.zip
  SHA256SUMS.txt
```

- The ZIP contains only `wotask.exe`.
- It excludes source code, build dependencies, personal data, and WebView2.
- The command uses installed tools and cached Rust dependencies. Missing dependencies cause a
  failure instead of an automatic download.
- Generated files in `release/` are excluded from Git. Committing or tagging the source does not
  upload these files to GitHub.

**2. Verify the package.**

- Run the verification commands in **Development** below.
- Test the packaged EXE on Windows x64 with WebView2, without development tools and with
  networking disabled.
- Confirm that it opens, saves tasks, and preserves them after restarting.

**3. Attach the files to the GitHub Release.**

To finish the existing `v1.0` release (tag `mark1`):

1. Open that release on GitHub.
2. Click the **pencil icon** to edit it.
3. Attach these three local files in the release's asset upload area:
   - `release/woTask-0.1.0-windows-x64.exe`
   - `release/woTask-0.1.0-windows-x64.zip`
   - `release/SHA256SUMS.txt`
4. Save the release using **Update release**.
5. Reopen the release and confirm that **Assets** includes the EXE, ZIP, and checksum file
   alongside GitHub's two source-code archives.

The release title `v1.0` and tag `mark1` do not change the app's internal version. These files
are built as app version `0.1.0`; describe them accurately in the release notes. For future
releases, use a title and version tag that match the app version (for example `v0.1.0`).

**Building the package does not publish it automatically.** Once the assets are attached,
regular users can follow the download steps at the top of this README.

### Updating an existing copy

1. Close woTask.
2. Replace the old executable with the new one in the same folder.
3. Keep the `woTask-data` folder intact.
4. Open the new executable; your tasks remain available.

## Where your data lives

- **Storage:** a local SQLite database.
- **Default location:** `woTask-data` beside the executable.
- **USB use:** copy both the EXE and `woTask-data` to take your tasks with you.
- **Fallback:** if the executable's folder is not writable, data goes to `%APPDATA%\woTask`.
- **Find the active location:** open **Settings → Data location**.
- **Upgrades:** database migrations create a backup beside the database first, such as
  `wotask.db.v2.bak`, and roll back if the integrity check fails.

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

- `npm run audit:offline` checks the source and built frontend for remote asset URLs and network fetches.
- The Inter font is bundled locally.
- Lighting is generated from mesh lights; textures are drawn procedurally.
- No CDN links, remote fonts, HDRI downloads, or remote decoders are used.
- The Tauri security policy restricts connections to local app and IPC origins.
- The UI test checks that a full session makes zero external requests.

## Status

Version 0.1.0, and a personal project rather than a product. It works and it is tested, but the
contracts are still moving. Windows is the only platform currently built and tested.

## License

No licence has been chosen yet, which means default copyright applies: the code is public to read,
but not yet licensed for reuse. If you want to use any of it, open an issue and ask.
