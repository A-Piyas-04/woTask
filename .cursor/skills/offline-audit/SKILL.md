---
name: offline-audit
description: Scan the frontend source and build output for anything that would make a network request at runtime. Use before every commit that touches src/, public/ or index.html, and at every integration gate.
---

# Offline audit

1. Run `npm run build` so `dist/` is current.
2. Run `npm run audit:offline`.
3. If it fails, fix each reported line: replace remote URLs with bundled local assets, replace `<Environment preset>` with `<Lightformer>` meshes, and replace web fonts with the system font stack in `src/contracts/tokens.ts`.
4. Re-run until it prints `Offline audit passed`.
