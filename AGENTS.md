# Agent instructions

## Project
Offline Windows desktop task manager. Tauri 2 + React 19 + React Three Fiber.
Ships as ONE portable .exe. No network access at runtime, ever.

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

## Verification
- `npm run build` (runs `tsc --noEmit` + Vite build)
- `npm run audit:offline`
- `npm run test:ui` with `npm run dev` running (drives system Edge via playwright-core)
- `cargo test` and `cargo check` in `src-tauri/`

## Out of scope
Do not add telemetry, analytics, auto-update, or cloud sync.
