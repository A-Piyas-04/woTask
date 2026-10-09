# 3D Task Manager — Implementation Plan

**Target:** A single-file portable `.exe` for Windows. Fully offline. Local persistent storage. A simple, intuitive task manager whose entire interface is rendered in real-time 3D.

**Build method:** Cursor IDE multi-agent mode (parallel agents in git worktrees).

**Document version:** 1.0 — October 2026

---

## Table of contents

1. [The one-paragraph summary](#1-the-one-paragraph-summary)
2. [Stack decisions and why](#2-stack-decisions-and-why)
3. [How to structure work for parallel agents](#3-how-to-structure-work-for-parallel-agents)
4. [Repository layout and file ownership](#4-repository-layout-and-file-ownership)
5. [Wave 0 — solo setup (do not parallelise this)](#5-wave-0--solo-setup-do-not-parallelise-this)
6. [Cursor configuration](#6-cursor-configuration)
7. [Skills to install](#7-skills-to-install)
8. [Wave 1 — four agents in parallel](#8-wave-1--four-agents-in-parallel)
9. [Gate 1 — integration](#9-gate-1--integration)
10. [Wave 2 — four agents in parallel](#10-wave-2--four-agents-in-parallel)
11. [Gate 2 — integration](#11-gate-2--integration)
12. [Wave 3 — polish and hardening](#12-wave-3--polish-and-hardening)
13. [Wave 4 — ship](#13-wave-4--ship)
14. [Offline constraints (critical)](#14-offline-constraints-critical)
15. [Performance budget](#15-performance-budget)
16. [Known traps](#16-known-traps)
17. [Timeline](#17-timeline)

---

## 1. The one-paragraph summary

Tauri 2 wraps a React + React Three Fiber frontend into a single ~10–15 MB Windows executable with SQLite statically linked into the binary. The task-manager logic is trivial; essentially all the engineering effort goes into the 3D presentation layer and into making that layer fast, offline, and legible. The work is split into four parallel tracks that own disjoint directories and communicate only through a set of TypeScript contracts frozen before any agent starts. Four agents run concurrently in git worktrees, merge at a gate, then fan out again.

---

## 2. Stack decisions and why

| Layer | Choice | Reasoning |
|---|---|---|
| Shell | **Tauri 2.x** | `tauri build` emits a true standalone `.exe` with frontend assets compiled in. ~8–15 MB. Electron's `portable` target is a ~90 MB self-extracting archive that unpacks to `%TEMP%` on every launch and trips antivirus heuristics. |
| Webview | **WebView2** (system) | On Windows this is Chromium. Full WebGL2 and WebGPU, same shader behaviour as Chrome, same DevTools. This is why Tauri is safe here despite its weak WebGL story on Linux/WebKitGTK. |
| Frontend | **React 19 + TypeScript + Vite** | Required pairing for R3F v9. Vite is Tauri's default and gives fast HMR. |
| 3D | **three + @react-three/fiber v9 + @react-three/drei** | Declarative scene graph. Drei supplies the material and lighting primitives that create the "expensive" look. |
| Post-processing | **@react-three/postprocessing** | Bloom, N8AO, DOF, chromatic aberration, SMAA. This layer is most of the perceived quality. |
| Animation | **@react-spring/three** + **maath** | Spring physics for press/hover. Springs read as physical; eased tweens read as cheap. |
| Debug GUI | **leva** | Live-binds material/light parameters. Highest-leverage package on this list for an aesthetics-driven build. |
| State | **zustand** | Readable from `useFrame` without triggering React renders. |
| Storage | **SQLite** via `rusqlite` (`bundled` feature) | Statically links SQLite into the exe. No external DLL, no runtime dependency. |
| Shaders | **vite-plugin-glsl** | Import `.glsl` files directly. |
| Packaging | **`tauri build`** → raw release binary | Ship `src-tauri/target/release/<app>.exe` directly, not the NSIS installer. |

### Why not Electron

Electron would guarantee a bundled Chromium on every platform, which matters if you ever ship Linux. For a Windows-only single-file deliverable it costs 80 MB and buys nothing — WebView2 is already Chromium.

### Why not Godot / Bevy / wgpu

More raw graphics power and a real 3D editor, but every text field, scrollbar, clipboard action, and IME interaction becomes hand-built. For a Windows app with Bangla/English text input, the webview's native text handling is worth more than the extra GPU headroom.

### The WebView2 dependency

On Windows 10 (April 2018 release or later) and Windows 11, the WebView2 runtime ships as part of the operating system. In practice it is present on effectively every modern machine. Embedding a fixed WebView2 runtime guarantees universal compatibility but adds roughly 180 MB, which defeats the single-file goal.

**Decision:** assume it is present. Add a clear error dialog if webview creation fails. Produce a second "offline" build later only if a real user hits the problem.

---

## 3. How to structure work for parallel agents

Cursor 3 (April 2026) is built around the **Agents Window** (`Cmd/Ctrl+Shift+P` → "Agents Window"). Each agent runs in its own git worktree on its own branch, so file edits cannot collide. Up to 8 agents can run concurrently. `/worktree` creates an isolated worktree; `/best-of-n` runs the same task across multiple models in parallel and lets you compare results.

Parallelism does not come free. Three rules make or break it:

### Rule 1 — Freeze the contracts before any agent starts

Agents cannot negotiate an interface with each other. If Track B invents `Task.dueDate: Date` while Track C assumes `Task.due: number`, you spend the integration gate rewriting both. Every shared type, every function signature, every design token must exist in `src/contracts/` and be treated as read-only by all agents.

**You write these yourself. No agent touches `src/contracts/`.**

### Rule 2 — One directory, one owner

Two agents editing the same file in two worktrees produces a merge conflict you have to resolve by hand, and agent-written code conflicts badly because both sides rewrote the whole file. Assign each track a directory tree it exclusively owns. The ownership table in section 4 is the single most important part of this document.

### Rule 3 — Every track must run standalone

Track C (3D) cannot wait for Track B (database). Provide `src/mocks/` with realistic fake data conforming to the frozen contracts on day one. Track C and D develop entirely against mocks and never import from `src/data/`.

### What parallelism is good for here

- **Genuinely independent work**: the Rust shell, the database layer, the material library, and the DOM layer touch nothing in common.
- **Competing attempts at one visual**: this is where `/best-of-n` earns its cost. Run the same "hero task card" prompt across three models, look at all three, keep one.

### What it is bad for

- Anything requiring a shared architectural decision mid-flight.
- Debugging an integration failure. Do that single-threaded.
- Visual refinement. An agent cannot see its own render. You are the only one who can judge whether it looks good.

---

## 4. Repository layout and file ownership

```
task-manager/
├── AGENTS.md                      # OWNER: you — read by every agent, every session
├── .cursor/
│   ├── rules/                     # OWNER: you
│   ├── skills/                    # OWNER: you
│   ├── plans/                     # OWNER: Plan Mode output
│   └── worktrees.json             # OWNER: you
│
├── src/
│   ├── contracts/                 # OWNER: you — FROZEN, read-only to all agents
│   │   ├── task.ts                #   Task, List, Tag, Priority + zod schemas
│   │   ├── repository.ts          #   TaskRepository interface
│   │   ├── tokens.ts              #   colors, easings, spacing, material params
│   │   └── events.ts              #   UI event names and payloads
│   │
│   ├── mocks/                     # OWNER: you — fake data for Tracks C and D
│   │   └── tasks.ts
│   │
│   ├── data/                      # OWNER: Track B
│   │   ├── repository.ts          #   implements contracts/repository.ts
│   │   └── migrations/
│   │
│   ├── state/                     # OWNER: Track B
│   │   └── store.ts               #   zustand
│   │
│   ├── scene/                     # OWNER: Track C
│   │   ├── materials/
│   │   ├── lighting/
│   │   ├── objects/
│   │   ├── effects/
│   │   └── Scene.tsx
│   │
│   ├── ui/                        # OWNER: Track D
│   │   ├── TitleBar.tsx
│   │   ├── TaskInput.tsx
│   │   ├── CommandPalette.tsx
│   │   └── shortcuts.ts
│   │
│   └── app/                       # OWNER: you — integration only
│       └── App.tsx
│
├── src-tauri/                     # OWNER: Track A
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs
│   │   ├── db.rs                  #   coordinate with Track B at Gate 1
│   │   └── paths.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
│
└── public/                        # OWNER: Track C (fonts, decoders, local assets)
```

**The `src/app/` boundary is yours.** Agents produce components; you wire them together. This keeps integration conflicts in one small file you understand completely.

---

## 5. Wave 0 — solo setup (do not parallelise this)

**Duration: 4–6 hours. Everything downstream depends on getting this right.**

### 0.1 — Toolchain

```bash
# Rust toolchain
winget install Rustlang.Rustup
rustup default stable-x86_64-pc-windows-msvc

# Visual Studio Build Tools with the "Desktop development with C++" workload
winget install Microsoft.VisualStudio.2022.BuildTools

# Verify
rustc --version
cargo --version
node --version          # 20+
```

Install the C++ workload before anything else. A missing `link.exe` is the single most common Tauri setup failure and it surfaces as an opaque linker error twenty minutes into a build.

### 0.2 — Scaffold

```bash
npm create tauri-app@latest task-manager -- --template react-ts
cd task-manager
npm install

npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install @react-spring/three maath zustand zod
npm install -D @types/three leva vite-plugin-glsl

cd src-tauri
cargo add rusqlite --features bundled
cargo add serde --features derive
cargo add chrono --features serde
cd ..

# Confirm the toolchain end to end before writing a line of app code
npm run tauri build
ls src-tauri/target/release/*.exe
```

**Do not proceed until that `.exe` exists and launches.** Everything after this assumes a working build.

### 0.3 — Freeze the contracts

Write `src/contracts/task.ts`, `repository.ts`, `tokens.ts`, `events.ts` by hand. This is the deliberate bottleneck. Spend real time here.

`tokens.ts` is the one people skip, and it is the reason multi-agent 3D work usually looks incoherent. It must define:

- Palette (base, surface, accent, priority colours) as `THREE.Color`-compatible hex
- Spring configs (`press`, `hover`, `enter`, `exit`) as `{ tension, friction, mass }`
- Material presets: transmission, roughness, thickness, IOR, chromatic aberration per surface class
- Lighting rig constants: key/fill/rim positions, intensities, colour temperatures
- Scene spacing: card dimensions, gutter, stack depth, camera distances

If two agents each invent their own glass material, you get two different-looking glasses. If both import `MATERIALS.glass` from tokens, you get one.

### 0.4 — Mock data

`src/mocks/tasks.ts` — 40 tasks across 4 lists with varied titles (include some long ones and some Bangla text to catch layout and font issues early), priorities, due dates, completion states.

### 0.5 — The hero spike (best-of-n)

Before splitting into tracks, settle the look of **one** task card. In a plain `vite dev` browser tab — no Tauri, no database.

Use `/best-of-n` in the agent chat. One prompt, three models, three worktrees, three results side by side:

> Build a single 3D task card component in React Three Fiber. Import all colours, material params, and spring configs from `src/contracts/tokens.ts` — invent nothing. The card is a rounded box with a transmission (glass) material, floating slightly, with a soft contact shadow. On hover it lifts and its rim light brightens. On click it presses inward with a spring. Lighting comes from `<Lightformer>` meshes inside `<Environment resolution={256}>` — do NOT use an HDRI preset, the app must work offline. Add a leva panel exposing every material and light parameter for live tuning. Render the card title using a locally bundled font. No network requests of any kind.

Pick the winner, tune it with leva until you love it, then **write the settled values back into `tokens.ts`**. That file is now the design system, and every downstream agent inherits it.

This spike is the project's real go/no-go. If the look you want is not achievable here, you learn it in two days rather than three weeks.

---

## 6. Cursor configuration

### 6.1 — `AGENTS.md` (project root)

Cursor reads `AGENTS.md` at the project root plus any nested ones in subdirectories. Every agent sees it. Keep it short and absolute.

```markdown
# Agent instructions

## Project
Offline Windows desktop task manager. Tauri 2 + React 19 + React Three Fiber.
Ships as ONE portable .exe. No network access at runtime, ever.

## Hard rules
1. NEVER edit files in `src/contracts/`. They are frozen. If you believe a
   contract is wrong, STOP and report it — do not work around it.
2. NEVER make a network request. No CDN links, no `<Environment preset="...">`,
   no Google Fonts URLs, no remote Draco decoder. Every asset is local.
3. Only edit files inside the directory your task assigns you.
4. Import all colours, easings, spacing, and material parameters from
   `src/contracts/tokens.ts`. Never hardcode a colour or a spring config.
5. Animate via refs inside `useFrame`. Never drive per-frame animation
   through React state.
6. TypeScript strict mode. No `any`. No `@ts-ignore`.

## Verification
Run `npm run build` and `npx tsc --noEmit` before declaring done.
Rust tracks also run `cargo check` in `src-tauri/`.

## Out of scope
Do not add telemetry, analytics, auto-update, or cloud sync.
```

### 6.2 — `.cursor/rules/`

Scoped rules beat one giant instruction file. Use `globs` so each rule only loads when relevant.

| File | Scope | Contents |
|---|---|---|
| `00-stack.mdc` | always | Versions, package list, forbidden dependencies |
| `10-r3f.mdc` | `src/scene/**` | Instancing, disposal, `frameloop="demand"`, no state in `useFrame` |
| `20-tauri.mdc` | `src-tauri/**` | Command registration, capability/permission entries, error handling |
| `30-offline.mdc` | always | The no-network rule restated with concrete bad/good examples |
| `40-ui.mdc` | `src/ui/**` | DOM layer owns all text and input; keyboard-first; focus management |

### 6.3 — `.cursor/worktrees.json`

Worktree setup is configurable per project. Each worktree needs its own `node_modules` and its own dev port, otherwise four agents fight over port 1420.

```json
{
  "setupCommands": ["npm install"],
  "env": { "VITE_PORT": "0" }
}
```

Set Vite to port `0` (auto-assign) in `vite.config.ts` so parallel worktrees never collide.

### 6.4 — Project skills (`.cursor/skills/`)

Cursor discovers skills automatically from `.cursor/skills/<name>/SKILL.md` at the project root and `~/.cursor/skills/` globally, and they can be invoked with `/skill-name` in chat.

**Your own project skills are worth more than any community skill here.** Write these three:

| Skill | Purpose |
|---|---|
| `/new-3d-object` | Scaffolds a scene component: tokens import, `useFrame` ref pattern, disposal in cleanup, leva binding, mock-data story |
| `/new-tauri-command` | Rust command + `invoke_handler` registration + capability entry + typed TS wrapper, all four steps every time |
| `/offline-audit` | Greps the whole tree for `http://`, `https://`, `preset=`, CDN hostnames, and fails loudly |

Run `/offline-audit` at every gate. It will catch things.

### 6.5 — Modes

- **Plan Mode (`Shift+Tab`)** before anything bigger than one file. Save plans to `.cursor/plans/`. Plan Mode is the difference between an agent that flails for twenty turns and one that delivers in two.
- **Design Mode** for Track D's DOM layer — it lets agents target specific UI elements visually.
- **Agents Window** (`Cmd/Ctrl+Shift+P`) to supervise all running tracks in one sidebar.

---

## 7. Skills to install

> **Caution:** these are third-party community skills from a young ecosystem. There is no official Cursor skill registry as of mid-2026 — teams share skills through GitHub repos under the open Agent Skills standard. **Read each `SKILL.md` before installing.** A skill is plain-text instructions injected into your agent's context; a bad one silently degrades every agent that loads it. Treat the list below as candidates to evaluate, not as a shopping list. Commands and repos change; verify before running.

The `-a cursor` flag targets Cursor's skill directory (`~/.cursor/skills/`), and `-y` skips the prompt.

### React Three Fiber (highest value for this project)

```bash
# Poimandres-ecosystem best practices — fiber, drei, postprocessing, rapier, leva
npx skills add https://github.com/emalorenzo/three-agent-skills --skill r3f-best-practices -a cursor -y

# Pure three.js performance and memory management
npx skills add https://github.com/emalorenzo/three-agent-skills --skill three-best-practices -a cursor -y

# Granular R3F set: fundamentals, geometry, lighting, shaders, postprocessing
npx skills add https://github.com/enzed/r3f-skills -a cursor -y

# Compact R3F reference with current version pairings
npx skills add b-open-io/prompts --skill threejs-r3f -a cursor -y
```

### Tauri

```bash
# Tauri 2 desktop patterns — commands, IPC, state, plugins
npx skills add travisjneuman/.claude --skill tauri-desktop -a cursor -y

# Alternative, via the playbooks CLI
npx playbooks add skill johnlarkin1/claude-code-extensions --skill tauri
```

### Verify installation

```bash
ls ~/.cursor/skills/
cat ~/.cursor/skills/r3f-best-practices/SKILL.md | head -40
```

Restart Cursor. Skills are discovered on startup. Type `/` in agent chat to confirm they appear.

### Manual install (always works)

```bash
mkdir -p .cursor/skills/my-skill
# place SKILL.md inside
```

Commit `.cursor/skills/` to the repository so every worktree inherits it.

---

## 8. Wave 1 — four agents in parallel

**Duration: 3–5 days wall-clock. Launch all four on the same morning.**

Each track gets its own worktree via `/worktree`. Each prompt below should be run through Plan Mode first.

---

### Track A — Shell and build

**Owns:** `src-tauri/**` (except `db.rs`), `tauri.conf.json`

**Deliverables**

1. Frameless window: `decorations: false`, transparent background, minimum size, centred on first launch
2. Custom window controls exposed as Tauri commands (minimise, maximise, close) for the DOM titlebar to call
3. Portable path resolution in `paths.rs`:
   - resolve `std::env::current_exe()`
   - write a probe file to that directory
   - on success, store data next to the exe (portable behaviour)
   - on failure (read-only location such as `Program Files`), fall back to `%APPDATA%\TaskManager\`
   - expose the resolved path as a command so the UI can display it
4. Capability/permission entries in `src-tauri/capabilities/default.json`
5. Graceful failure dialog if WebView2 is absent
6. Icon embedded via `tauri.conf.json`
7. `cargo check` and `npm run tauri build` both clean

**Acceptance:** `.exe` runs from Desktop, from `C:\Program Files\`, and from a USB drive, resolving a writable data path in all three cases.

---

### Track B — Data and state

**Owns:** `src/data/**`, `src/state/**`, `src-tauri/src/db.rs`

**Deliverables**

1. SQLite schema: `tasks`, `lists`, `tags`, `task_tags`. Integer timestamps, not strings.
2. Idempotent migration runner on startup
3. Rust commands: `list_tasks`, `create_task`, `update_task`, `delete_task`, `reorder_tasks`, `list_lists`
4. `src/data/repository.ts` implementing `contracts/repository.ts` exactly, wrapping `invoke()`
5. `src/state/store.ts` — zustand, optimistic updates, rollback on command failure
6. Zod validation at the IPC boundary in both directions
7. Seed path that loads `src/mocks/tasks.ts` on an empty database

**Acceptance:** a throwaway DOM test page creates, edits, reorders and deletes tasks; closing and reopening the app preserves everything.

> Track B owns `src-tauri/src/db.rs` even though it sits in Track A's directory. Agree the module boundary in Wave 0: `main.rs` calls `db::init()` and registers `commands::*`, nothing more. Track A must not touch `db.rs`.

---

### Track C — 3D system

**Owns:** `src/scene/**`, `public/**`

**Deliverables**

1. `materials/` — the glass/transmission material from the hero spike, plus surface, accent, and completed-state variants. All parameters from `tokens.ts`.
2. `lighting/StudioRig.tsx` — `<Lightformer>` meshes inside `<Environment resolution={256}>`. No HDRI file, no preset.
3. `objects/TaskCard.tsx` — the hero component, generalised, driven by props typed from `contracts/task.ts`
4. `objects/TaskStack.tsx` — many cards via drei `<Instances>` / `<Instance>`
5. `effects/Composer.tsx` — Bloom, N8AO, DOF, chromatic aberration, SMAA, with a quality tier prop (`high` / `medium` / `low`)
6. `Scene.tsx` — single persistent `<Canvas>`, `frameloop="demand"`, `invalidate()` on interaction
7. Local font bundling in `public/fonts/` with a self-hosted Draco decoder if GLTFs are used
8. A `scene-dev` route rendering against `src/mocks/tasks.ts` only

**Hard constraints for this track**

- Never import from `src/data/` or `src/state/`
- Never animate through React state
- Dispose geometries and materials in `useEffect` cleanup
- 200 mock tasks must hold 60 fps

**Acceptance:** `npm run dev` → scene route shows 200 mock task cards at 60 fps with the full effect chain, and nothing in the network tab.

> **Verification gap:** the agent cannot see its own render. Instruct it to add a Playwright screenshot script, or review each iteration yourself in Design Mode. Do not let this track run unsupervised for long stretches — it will produce code that compiles and looks wrong.

---

### Track D — DOM layer

**Owns:** `src/ui/**`

**Deliverables**

1. `TitleBar.tsx` — custom chrome with a drag region (`data-tauri-drag-region`) and window control buttons
2. `TaskInput.tsx` — the capture field. Must support IME and Bangla input correctly.
3. `CommandPalette.tsx` — `Ctrl+K`, fuzzy search, keyboard-driven
4. `shortcuts.ts` — global keymap: new task, complete, delete, undo, switch list, focus search
5. Focus management and a visible focus ring; the whole app usable without a mouse
6. Transparent backgrounds throughout — this layer composites over the WebGL canvas
7. Reduced-motion support reading `prefers-reduced-motion`

**Hard constraints**

- All text and all text entry live here, never in WebGL. Text rendered in WebGL is blurry at UI sizes and text inputs in WebGL are unusable.
- Pointer events must pass through to the canvas except on actual controls (`pointer-events: none` on containers, `auto` on interactive children).

**Acceptance:** every operation performable by keyboard alone; Bangla text enters, renders, and persists correctly.

---

## 9. Gate 1 — integration

**You do this alone. Do not run agents during a gate.**

1. Merge all four worktrees in order: A → B → C → D
2. Wire everything in `src/app/App.tsx`: store feeds `<Scene>`, DOM layer composites on top
3. Run `/offline-audit`
4. Build the exe, launch it, create a task, close it, reopen it
5. Profile: open DevTools in the Tauri window, check frame time and draw calls
6. **Update `tokens.ts` with anything the integration revealed**, then re-freeze

Expect this to take a full day. The first integration of parallel agent work always surfaces assumptions nobody wrote down.

---

## 10. Wave 2 — four agents in parallel

**Duration: 4–6 days.**

### Track A2 — Packaging and resilience

- Release profile tuning in `Cargo.toml`: `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`
- Window state persistence (size, position, maximised) in the local data directory
- Crash handling: if the webview fails, show a native dialog rather than a blank window
- Single-instance enforcement
- Binary size audit — report what each dependency costs

### Track B2 — Data depth

- Undo/redo stack (command pattern, 50 levels)
- Recurring tasks
- Full-text search across titles and notes
- JSON export/import for backup
- WAL mode, indices on `list_id` and `due_at`
- Benchmark: 10,000 tasks must query in under 16 ms

### Track C2 — Interaction and motion

- Drag to reorder with raycasting and spring-based settling
- Completion animation (the signature moment of the app — spend real time here)
- Camera transitions between list views
- Creation and deletion animations
- Priority expressed through material, not just colour
- Idle ambient motion (subtle float, parallax on cursor)

### Track D2 — Information layer

- Task detail panel
- List and tag management UI
- Settings: quality tier, data location display, theme
- Empty states and first-run experience
- Toast notifications

---

## 11. Gate 2 — integration

Same discipline as Gate 1. Additionally:

- Run the full effect chain on the weakest machine you have access to, and set the default quality tier from that result
- Verify the exe still launches from a read-only directory
- Check binary size against budget (target: under 20 MB)

---

## 12. Wave 3 — polish and hardening

Fewer agents, more supervision. Mostly you and one agent at a time.

| Task | Notes |
|---|---|
| Motion choreography pass | Timing and sequencing across every transition. Human judgement only. |
| Perf pass | `frameloop="demand"` audit, instancing coverage, texture sizes, draw-call count |
| Quality tiers | Verify `low` runs on integrated graphics at 60 fps |
| Accessibility | Full keyboard coverage, reduced-motion path, focus visibility, contrast |
| Error paths | Database locked, disk full, corrupt database file, read-only directory |
| 3D QA agent | Dedicated agent that only writes Playwright screenshot tests and reports visual regressions |
| Cold-start time | Target under 1.5 s from double-click to interactive |

---

## 13. Wave 4 — ship

```bash
npm run tauri build
# Deliverable:
#   src-tauri/target/release/task-manager.exe
```

Ship that file directly. Ignore the NSIS/MSI installers in `target/release/bundle/` — you want the raw binary.

**Final checklist**

- [ ] Runs on a machine that has never had the project on it
- [ ] Runs with networking fully disabled
- [ ] Runs from a USB drive
- [ ] Runs from `C:\Program Files\` (falls back to `%APPDATA%`)
- [ ] Data survives close/reopen and a reboot
- [ ] Binary under 20 MB
- [ ] Cold start under 1.5 s
- [ ] 60 fps with 500 tasks on the target machine

**SmartScreen:** an unsigned `.exe` triggers "Windows protected your PC." Users must click *More info → Run anyway*. For personal use this is noise. For distribution, a code signing certificate (roughly $100–400/year) is the only real fix. Nothing else removes the warning.

---

## 14. Offline constraints (critical)

This is the failure mode most likely to reach your users. Several convenient drei APIs fetch from the network, and in a browser during development they work perfectly. In the shipped offline exe they fail silently and you get a black scene.

| Forbidden | Use instead |
|---|---|
| `<Environment preset="city" />` | `<Environment resolution={256}>` with `<Lightformer>` meshes |
| `<Text font="https://fonts.gstatic.com/..." />` | Local `.ttf` in `public/fonts/`, imported |
| `useGLTF` with default Draco decoder | Self-hosted decoder in `public/draco/` |
| Any `<script src="https://...">` | Bundle it |
| Google Fonts `@import` in CSS | Local `@font-face` |

Procedural Lightformer lighting is not just the offline workaround — it is also more art-directable than a stock HDRI, costs zero bytes, and gives you per-light control exposed through leva.

**Enforcement:** the `/offline-audit` skill, run at every gate, plus the rule in `AGENTS.md`, plus a CI grep. Belt and braces, because an agent that cannot test offline will reintroduce a CDN link the moment you stop watching.

---

## 15. Performance budget

| Metric | Target | Ceiling |
|---|---|---|
| Frame time (500 tasks) | 16 ms | 33 ms |
| Draw calls | < 50 | 120 |
| Cold start | 1.0 s | 1.5 s |
| Idle CPU | ~0% (demand frameloop) | 2% |
| Idle GPU | 0% | 5% |
| Binary size | 12 MB | 20 MB |
| Memory, 1000 tasks | 150 MB | 300 MB |

Idle cost matters more than peak for this app. A task manager sits open all day. A render loop spinning at 60 fps on an idle window will drain a laptop battery and get your app closed permanently. `frameloop="demand"` with explicit `invalidate()` is not optional.

---

## 16. Known traps

| Trap | Mitigation |
|---|---|
| Missing C++ build tools | Install before anything else; the error is opaque |
| Four worktrees fighting over port 1420 | Vite `port: 0`; only Track A runs `tauri dev`, others use `vite dev` in a browser |
| Agents editing `src/contracts/` | Rule 1 in `AGENTS.md`; re-check at every gate |
| Two agents inventing two glass materials | Everything from `tokens.ts`; no local material definitions |
| CDN links reappearing | `/offline-audit` at every gate |
| Agent cannot see its render | Screenshot tests; you review Track C personally |
| `node_modules` ×4 worktrees | ~2 GB of disk; expected, not a bug |
| Rust rebuild times per worktree | Share a `CARGO_TARGET_DIR`, or only compile Rust in Track A's worktree |
| Text rendered in WebGL | DOM layer owns all text. Non-negotiable. |
| Parallel agent cost | Composer 2 is fast, but four agents burn credits quickly. Watch the first day's spend before committing to the pattern. |
| React state in `useFrame` | Rule 5 in `AGENTS.md`; catch it in review |
| Merge conflicts in agent-written code | Strict directory ownership; never two agents in one tree |

---

## 17. Timeline

| Stage | Duration | Agents | Output |
|---|---|---|---|
| Wave 0 — setup and contracts | 1 day | 0 | Toolchain, scaffold, frozen contracts, mocks |
| Wave 0.5 — hero spike (`/best-of-n`) | 2 days | 3 (competing) | Settled visual language in `tokens.ts` |
| Wave 1 | 3–5 days | 4 (parallel) | Shell, data, 3D kit, DOM layer |
| Gate 1 | 1 day | 0 | First integrated build |
| Wave 2 | 4–6 days | 4 (parallel) | Packaging, data depth, interaction, info layer |
| Gate 2 | 1 day | 0 | Feature-complete build |
| Wave 3 — polish | 5–8 days | 1–2 | Motion, perf, accessibility, QA |
| Wave 4 — ship | 1 day | 0 | Signed-or-not single exe |
| **Total** | **~3.5–5 weeks** | | |

Wave 3 is the one that stretches. Everything before it is tractable engineering with clear acceptance criteria. Polish is taste work, it cannot be parallelised, and on an aesthetics-first project it is where the product is actually won or lost. Budget generously and resist the urge to throw agents at it.

---

## Appendix A — Launch prompts

Paste these into four Cursor agents at Wave 1 start. Run each through Plan Mode (`Shift+Tab`) first.

**Track A**

> Read `AGENTS.md` and `src/contracts/`. You own `src-tauri/**` except `src/db.rs` — do not touch that file. Build the Tauri shell: frameless transparent window, window-control commands for the DOM titlebar, and portable data-path resolution in `paths.rs` (try the exe's own directory with a write probe, fall back to `%APPDATA%\TaskManager\`, expose the resolved path as a command). Add the capability entries. Verify with `cargo check` and `npm run tauri build`, and confirm the exe runs from a read-only directory.

**Track B**

> Read `AGENTS.md` and `src/contracts/`. You own `src/data/**`, `src/state/**`, and `src-tauri/src/db.rs`. Implement SQLite persistence with `rusqlite` (bundled): schema, idempotent migrations, CRUD and reorder commands, a `src/data/repository.ts` that implements `contracts/repository.ts` exactly, and a zustand store with optimistic updates and rollback. Validate with zod at the IPC boundary in both directions. Seed from `src/mocks/tasks.ts` when the database is empty.

**Track C**

> Read `AGENTS.md` and `src/contracts/tokens.ts`. You own `src/scene/**` and `public/**`. Do not import from `src/data/` or `src/state/` — render against `src/mocks/tasks.ts` only. Build the 3D system: material library, a `<Lightformer>` studio rig inside `<Environment resolution={256}>` (never a preset — the app is offline), the generalised TaskCard, an instanced TaskStack, and a post-processing composer with high/medium/low quality tiers. Single persistent Canvas, `frameloop="demand"`. All parameters come from tokens. 200 mock cards must hold 60 fps. Add Playwright screenshot tests so your output can be reviewed visually.

**Track D**

> Read `AGENTS.md` and `src/contracts/`. You own `src/ui/**`. Build the DOM layer that composites over the WebGL canvas: custom titlebar with drag region, task capture input with full IME and Bangla support, a `Ctrl+K` command palette, and a global keymap making every operation keyboard-reachable. All containers `pointer-events: none` with interactive children set to `auto` so the canvas still receives pointer events. Transparent backgrounds throughout. Honour `prefers-reduced-motion`.

---

## Appendix B — Reference links

- Tauri 2 Windows distribution and WebView2 options — https://v2.tauri.app/distribute/
- Tauri Linux graphics caveats (why Windows-only matters here) — https://v2.tauri.app/develop/debug/linux-graphics/
- React Three Fiber — https://github.com/pmndrs/react-three-fiber
- drei — https://github.com/pmndrs/drei
- Cursor changelog — https://cursor.com/changelog
- Cursor 3 announcement — https://cursor.com/blog/cursor-3
- Agent Skills specification — https://agentskills.io/
