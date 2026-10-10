# Agent instructions

## Project
Offline Windows desktop task manager. Tauri 2 + React 19 + React Three Fiber.
Ships as ONE Windows installer (NSIS, per-user) wrapping a single self-contained .exe.
No network access at runtime, ever - not in the app and not in the installer.

## Hard rules
1. Treat `src/contracts/` as frozen. If you believe a contract is wrong, STOP and report it.
2. NEVER make a network request. No CDN links, no `<Environment preset="...">`,
   no Google Fonts URLs, no remote Draco decoder. Every asset is local.
3. `src/scene/` never imports from `src/data/` or `src/state/`; it renders props only.
   `src/app/App.tsx` is the only place the store is wired to the scene.
4. Import all colours, motion timings, spacing and material parameters from
   `src/contracts/tokens.ts`. Never hardcode a colour or an animation timing.
5. Animate via refs inside `useFrame` and call `invalidate()` while moving
   (the canvas uses `frameloop="demand"`). Never drive per-frame animation through React state.
6. All text and text entry live in the DOM, never in WebGL. Card labels use drei `<Html>` with
   the `portal` layer from `Scene.tsx`.
7. TypeScript strict mode. No `any`. No `@ts-ignore`.
8. The domain says **space** (`Space`, `spaceId`, `SpaceKind`). The wire format - SQLite tables and
   columns, Tauri command names, the localStorage blob - still says `region`, and
   `src/data/repository.ts` is the only place that mapping lives. Do not let `region` leak above it,
   and do not rename the database to match: that would rewrite tables holding real data for nothing.
9. A chain is `Task.blockedBy`: one predecessor in, many successors out. Being *locked* is derived,
   never stored, so reopening a blocker re-locks its successors for free. The lock is soft - the user
   can complete a blocked task after a confirmation. Every traversal of the chain must be cycle-safe
   (a visited set or a hop cap); bad data must degrade, not hang the render loop.

## Verification
- `npm run build` (runs `tsc --noEmit` + Vite build)
- `npm run audit:offline`
- `npm run test:chain` (pure selectors, loaded through Vite SSR; no dev server needed)
- `npm run test:ui` and `npm run test:visual` with `npm run dev` running (system Edge via playwright-core)
- `npm run test:palette`
- `cargo test` and `cargo check` in `src-tauri/`

## Out of scope
Do not add telemetry, analytics, auto-update, or cloud sync.
