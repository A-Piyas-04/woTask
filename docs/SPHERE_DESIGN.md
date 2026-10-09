# woTask — Sphere & Constellation Design

How the 3D view works: what every sphere, line and region means, how priority and completion are shown, how zones (lists) are laid out, and how to change any of it.

All numbers below come from `src/contracts/tokens.ts`. Change them there, never in components.

---

## 1. The mental model

The whole app is a small universe:

| On screen | Represents | Data |
|---|---|---|
| **Zone** (a region of space with a dashed orbit and a title) | One **list** (Inbox, Personal, Work, …) | `List` in `src/contracts/task.ts` |
| **Hub** (small bright sphere at the centre of a zone) | The list itself — its anchor point | `List.color` |
| **Task sphere** (glass ball with a glowing core) | One **task** | `Task` |
| **Light lines** | Visual grouping: which tasks belong to which list | derived, not stored |
| **Label under a sphere** | Task title, due date, tags | DOM text (never WebGL) |
| **Background** (stars, nebula, dust) | Nothing — pure atmosphere and depth cues | procedural, no files |

You never "open" a list in the 3D view. Every list is always present as its own zone; selecting a list just flies the camera to it.

---

## 2. Zones (regions) — e.g. Inbox and Personal

### What a zone is
A zone is the spatial home of one list. Each list gets exactly one zone, in the order of the sidebar (`List.position`).

- **Inbox** — the default catch-all list; new users start here. Quick captures land in whichever list is active, so Inbox is just a convention, not special-cased in code.
- **Personal** — a second default list created on first launch, empty, ready for private tasks.
- Any list you create (`+ New list` or `Ctrl+Shift+N`) becomes a new zone automatically. Renaming changes the zone title; deleting a list removes its zone **and its tasks** (undoable with `Ctrl+Z`).

> First launch of a release build seeds `Inbox` (with welcome tasks) and `Personal` (empty) — see `buildWelcomeData()` in `src/mocks/tasks.ts`. Development builds (`npm run dev`) seed four demo lists instead: Inbox, Work, বাড়ি (Home), Ideas.

### What a zone shows
- **Title** above the orbit: list name (large, spaced capitals, glowing in the list colour) and a count: `N open · M done`, or `empty — press N to add`.
- **Hub**: a glowing icosphere in the list colour. It gently pulses when ambient motion is on. **Clicking the hub makes that list active.**
- **Orbit**: a dashed ellipse around the cluster, slowly rotating. Its radius grows with the number of tasks.
- **Active zone**: its title is fully opaque; inactive zones are dimmed to 55%. The background nebula and dust tint toward the active list's colour.

### List colour
Assigned automatically when a list is created, cycling through `PALETTE.listColors`:
`#7c9cff` (blue), `#4fd1a5` (green), `#ffb547` (amber), `#f472b6` (pink), `#c084fc` (violet), `#38bdf8` (sky), `#ff6b7a` (red), `#a3e635` (lime).
The list colour drives the hub, the lines, the orbit, the zone title glow and the selection ring of its tasks.

### How zones are arranged in space
`computeLayout()` in `src/scene/layout.ts`:

1. Find the largest list; every zone gets the same radius so the grid stays regular:
   `zoneRadius = spiralRadius(maxTaskCount) + 1.2`
2. Cell size: `cell = zoneRadius × 2 + CONSTELLATION.zoneGap` (`zoneGap = 2.5`).
3. Columns: `ceil(√listCount)` — 4 lists → 2×2, 5–9 lists → 3 columns.
4. Positions are staggered so it reads as a sky, not a spreadsheet:
   - `x = col × cell × 1.15 + (row is odd ? cell × 0.45 : 0)`
   - `y = −row × cell × 0.9`
5. The first list is always at the origin `(0, 0)`.

The camera can pan anywhere inside the bounding box of all zones plus `CAMERA.boundsMargin` (8 units).

---

## 3. Task spheres (nodes)

Component: `src/scene/objects/TaskOrb.tsx`.

### Anatomy
```
   ╭───────────╮   ← glass shell: transmissive, iridescent, clearcoated
   │     ●     │   ← glowing core: colour = priority (or green when done)
   ╰───────────╯
  ◜─────────────◝  ← selection ring (only when selected), list colour, spins
   Task title       ← DOM label: title (max 2 lines), due date, up to 2 tags
   Today · #tag
```

- **Glass shell** — `MeshPhysicalMaterial` with `transmission: 1`, `iridescence: 0.85` (oil-film rainbow sheen), `ior: 1.45`. Its attenuation (inner tint) takes the priority colour, so the glass itself is coloured by priority.
- **Core** — unlit, HDR-bright material (`toneMapped: false`); bloom turns it into a glow.
- **Label** — HTML positioned under the sphere via drei `<Html>`; scales with zoom.

### Priority → colour and size
Priority is stored as `0 | 1 | 2 | 3` (`Task.priority`). It changes three things at once: core colour, glass tint, and sphere size.

| Priority | Name | Core / glass colour | Sphere radius |
|---|---|---|---|
| 0 | None | `#9aa6c4` pale steel | 0.50 |
| 1 | Low | `#4fa3ff` blue | 0.56 |
| 2 | Medium | `#ffb547` amber | 0.64 |
| 3 | High | `#ff4f6a` red | 0.74 |

Bigger and warmer = more urgent. You can spot a red, large sphere across the whole universe.

How to set priority:
- Quick add: type `!1`, `!2`, `!3` (or `!low`, `!med`, `!high`) in the task input, e.g. `Pay rent !3 #bills`.
- Select a sphere and press `P` to cycle None → Low → Medium → High → None.
- Editor panel (`Enter` / double-click): the Priority segmented control.

Colour transitions are animated (`MOTION.color.smoothTime = 0.2 s`); size changes spring smoothly.

### States

| State | Trigger | Visual |
|---|---|---|
| Idle | — | Floats gently in place, slowly spins, core at intensity 2.6 |
| Hover | Mouse over | Scale ×1.14, core brighter (4.0) |
| Pressed | Mouse down | Scale ×0.9 (quick squish, 0.06 s) |
| Selected | Click / `↑↓` / palette | Scale ×1.24, moves 0.6 toward camera, core 5.0 and pulsing, spinning ring in list colour, label enlarged; camera flies to it |
| Completed | Click a selected sphere / `Space` / editor | **Shockwave**: a green ring bursts outward and fades over 0.9 s. Then: core turns green `#4fd1a5` (dimmer, 1.8), glass becomes frosted (roughness 0.3), sphere shrinks to radius 0.44, title struck through |
| Entering | Task created / app start | Grows from nothing and rises out of depth; spheres appear one after another (40 ms stagger) |

Hide completed tasks with `H` (or the sidebar toggle); their spheres disappear and the constellation re-forms.

### Interaction summary
| Action | Result |
|---|---|
| Click sphere | Select it (and make its list active) |
| Click selected sphere again | Toggle complete |
| Double-click sphere | Open the editor panel |
| Click hub | Make that list active |
| Click empty space | Deselect |
| `↑` / `↓` (or `J` / `K`) | Select previous/next task in the active list |
| `Alt+↑` / `Alt+↓` | Reorder the selected task (moves it along the spiral) |
| `Del` | Delete (toast offers Undo) |

A drag never counts as a click: if the pointer moves more than 5 px between press and release, the release over a sphere is ignored (`pointerState.dragged` in `src/scene/interaction.ts`).

---

## 4. How spheres are placed inside a zone

### Order
Tasks of a list are ordered by `orderTasks()` (`src/state/store.ts`):
1. Open tasks by `position` (your manual order).
2. Then completed tasks, most recently completed first (only if "Show completed" is on).

New tasks get the lowest position, so **the newest task sits closest to the hub** and everything else shifts one step outward.

### Golden-angle spiral
Task `i` (0-based) in a zone with centre `(cx, cy)`:

```
r     = spiralSpacing × √(i + spiralStart)        // 1.95 × √(i + 1.1)
angle = listSpin + i × 137.5°                       // golden angle
x     = cx + cos(angle) × r × ellipseX              // ellipseX = 1.25 (wider than tall)
y     = cy + sin(angle) × r
z     = (hash(taskId) − 0.5) × depthJitter          // ±0.9 depth variation
```

Why this spiral: it's the sunflower-seed pattern. Spheres never overlap, the cluster grows evenly in every direction, and adding one task barely disturbs the rest. `listSpin` is a per-list hash so each zone's spiral is rotated differently and zones don't look identical.

Positions are recalculated whenever tasks change; spheres glide to their new spots (`MOTION.layout.smoothTime = 0.5 s`). Moving a task to another list in the editor makes its sphere fly across space into the new zone.

### Floating
With ambient motion on, each sphere bobs around its rest position on three independent sine waves:

- amplitude `[0.16, 0.22, 0.14]` units (x, y, z)
- speed `[0.55, 0.42, 0.37]` rad/s
- phases derived from the task id, so no two spheres move in sync

Spheres stay within their spot ("static in a zone") — they float, they don't wander.

---

## 5. Light lines (connections)

Component: `src/scene/objects/Constellation.tsx`.

The lines form a **constellation tree** for each zone (computed in `computeLayout`):

- Each sphere connects to the **nearest** of: the hub, or any sphere that comes *earlier* in the order.
- Result: every sphere is reachable from the hub, there is exactly one line per task, and lines don't criss-cross.

Lines are drawn in the list colour with additive blending (they glow where they overlap a sphere), brighter at the parent end. They follow the floating spheres live every frame. All lines of a zone are one draw call.

Lines carry no data — they show belonging and give each list a recognisable shape.

---

## 6. Camera and navigation

Component: `src/scene/CameraRig.tsx`.

| Input | Effect |
|---|---|
| Drag (left or middle button) | Pan in any direction; release with speed → momentum that decays (`MOTION.panFriction = 4.5`) |
| Mouse wheel | Zoom (camera distance 7 – 42, default 19) |
| `Shift` + wheel | Pan horizontally |
| Mouse position | Camera sways up to 1.1 × 0.7 units → parallax tilt |
| Select a task | Camera flies to that sphere |
| Switch list (sidebar, `Ctrl+←/→`, `Ctrl+1…9`, hub click) | Camera flies to that zone, framed so the title clears the input bar |

A fly-to only happens when the *target changes*. If you pan away from the selected sphere, the camera won't snap back until you select something else.

---

## 7. Parallax background

Component: `src/scene/objects/ParallaxBackground.tsx`. Nothing is loaded from disk or network — every texture is painted on a `<canvas>` at startup with a seeded random generator, so it looks identical on every launch.

| Layer | Depth (z) | Content |
|---|---|---|
| Backdrop | −110 | Opaque deep-space gradient with soft colour blobs; tinted by the active list colour. Also what the glass spheres refract. |
| Far nebula | −70 | Large transparent cloud layer, rotates very slowly |
| Stars | −95 … −30 | 700 / 1500 / 2600 points (low/medium/high quality), mixed warm/cool colours |
| Near nebula | −38 | Second cloud layer, rotates the other way |
| Dust | −6 … +5 | 420 faint particles around and in front of the spheres, slow drift |

Parallax is real, not faked: the camera physically moves when you pan, so near dust slides past quickly while stars and nebulae barely move.

---

## 8. Performance rules

- **Ambient motion** (floating, drifting, pulsing) renders continuously **only while the window is focused and visible**. In the background, or when turned off in Settings, the canvas switches to on-demand rendering: it renders only during interactions and transitions, so the idle cost is ~0%.
- Windows "reduce animations" (`prefers-reduced-motion`) disables floating and makes transitions instant.
- Sphere, core and ring geometries are shared by all spheres; materials are per-sphere (each animates its own colour) and disposed when the sphere is removed.
- Glass uses `MeshPhysicalMaterial` transmission, which shares one transmission pass for all spheres (unlike drei's `MeshTransmissionMaterial`, which renders the scene once per object).
- Quality tiers (Settings): **High** = bloom + chromatic aberration + SMAA, 48-segment spheres; **Medium** = bloom + SMAA, 32 segments; **Low** = no post-processing, 24 segments.

---

## 9. File map

| File | Responsibility |
|---|---|
| `src/contracts/tokens.ts` | Every colour, size, timing and layout constant (`PALETTE`, `CONSTELLATION`, `CAMERA`, `MOTION`, `MATERIALS`, `PARALLAX`, `QUALITY`) |
| `src/scene/layout.ts` | Zones grid, golden-angle spiral, constellation tree edges, pan bounds |
| `src/scene/Scene.tsx` | The canvas; picks camera focus; switches between continuous and on-demand rendering |
| `src/scene/CameraRig.tsx` | Drag / momentum / zoom / sway / fly-to |
| `src/scene/objects/TaskOrb.tsx` | One task sphere: glass, core, ring, shockwave, label, floating, states |
| `src/scene/objects/Constellation.tsx` | One zone: hub, orbit, connection lines, zone title |
| `src/scene/objects/ParallaxBackground.tsx` | Backdrop, nebulae, stars, dust |
| `src/scene/materials/materials.ts` | Material factories, shared geometries, procedural textures |
| `src/scene/interaction.ts` | Drag-vs-click state, live position registry, `useFrame` priorities |
| `src/scene/scene.css` | Sphere and zone label styles |
| `src/app/App.tsx` | Groups tasks per list and passes them to the scene |

The scene never imports the store or the database (`src/state`, `src/data`); it only renders what `App.tsx` passes in.

---

## 10. Common changes

| I want to… | Change |
|---|---|
| Make high-priority spheres even bigger | `CONSTELLATION.orbRadius[3]` |
| Change what colour "medium" is | `PALETTE.priority[2]` |
| Spread spheres further apart | `CONSTELLATION.spiralSpacing` |
| Put zones closer / further apart | `CONSTELLATION.zoneGap` |
| Calmer or livelier floating | `MOTION.float.amplitude` / `MOTION.float.speed` |
| Start more zoomed out | `CAMERA.distance` |
| Stronger mouse parallax | `CAMERA.pointerParallax` |
| More / fewer stars | `QUALITY.<tier>.stars` |
| Longer completion shockwave | `MOTION.burstSeconds` |
| Different glass look | `MATERIALS.glass` (e.g. `iridescence: 0` for plain glass, higher `roughness` for frosted) |
