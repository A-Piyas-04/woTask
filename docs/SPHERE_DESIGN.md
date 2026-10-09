# woTask — Spaces, Spheres & Constellation Design

How the 3D view works: what every sphere, line and zone means, how space, priority and completion are encoded, how spaces are laid out, and how to change any of it.

All numbers below come from `src/contracts/tokens.ts`. Change them there, never in components.

---

## 1. The mental model

The whole app is a small universe:

| On screen | Represents | Data |
|---|---|---|
| **Zone** (a patch of space with a faint floor disc and a title) | One **space**: a category, project or goal | `Space` in `src/contracts/task.ts` |
| **Hub** (small glowing sphere at the centre of a zone) | The space itself, its anchor point | `Space.colorIndex` |
| **Task sphere** (glass ball with a glowing core) | One **task** | `Task` |
| **Light lines** | Which tasks belong to which space | derived, not stored |
| **Label under a sphere** | Task title, due date, tags | DOM text (never WebGL) |
| **Background** (stars, nebula, dust) | Nothing; pure atmosphere and depth cues | procedural, no files |

You never "open" a space in the 3D view. Every space is always present as its own zone; choosing a space flies the camera to it.

### The colour rule

> **Hue = space. Everything else = priority. Desaturation = completed.**

A sphere's colour tells you *where* a task lives, never how urgent it is. Urgency is carried by size, core brightness, finish and extras (halo, ring), all of which survive a grayscale screenshot.

---

## 2. Spaces

### Kinds
| Kind | Use it for | Zone subtitle |
|---|---|---|
| **Category** | Ongoing areas with no end (পড়াশোনা, Backlog, Home) | `N open · M done` |
| **Project** | Finite pieces of work (Product Launch) | `N open · M done` |
| **Goal** | Outcomes with a target date (Health: run a 10K) | `N of T complete · D days left`, plus a progress arc around the hub |

Fields: name (1–80 chars), kind, optional one-line purpose (≤ 200 chars), colour (one of 8 hues), optional target date (goals), archived flag.

Sidebar, `Ctrl+1…9`, `Ctrl+←/→` and the zone grid all use the same display order: projects first, then goals, then categories, each group by position (`visibleSpaces()` in `src/state/store.ts`).

### Lifecycle
- **First run** shows the onboarding card ("What are you working on?"): name, kind and colour. There is no seeded Inbox. Development builds (`npm run dev`) seed four demo spaces instead: Product Launch (project), Health (goal, 45 days out), পড়াশোনা (category), Backlog (category).
- **New space**: `+ New space` in the sidebar, `Ctrl+Shift+N`, or the command palette.
- **Edit**: hover a sidebar row and press `⋯`. Changes save as you type.
- **Archive** hides a space and its zone but keeps its tasks; restore it from *Archived* at the bottom of the sidebar.
- **Delete** removes the space **and its tasks** (`Ctrl+Z` undoes). The last remaining space can't be deleted; the sidebar explains why inline.

### Space colour
Eight muted hues, deliberately equal in lightness and chroma (OKLCH, verified by `npm run test:palette`) so no space shouts louder than another:

`#7490BD` `#5F9E8F` `#C09562` `#B57D8E` `#8E83BC` `#6B9DB0` `#B9796B` `#8EA06E`

New spaces take the next unused hue. Each hue expands into a ramp (`spaceRamp()` in `src/scene/materials/materials.ts`, amounts in `RAMP`):

| Role | Formula | Used by |
|---|---|---|
| base | the hue | glass attenuation, hub, lines, disc, selection ring, shockwave, sidebar dot |
| core | mix(base, `#EAF0F7`, 0.45) | sphere cores, halo, high-priority ring |
| dim | mix(base, `#0A0C11`, 0.55) | hairline of inactive zones |
| text | mix(base, white, 0.55) | zone title |
| completed | mix(base, `#6B7280`, 0.75) | completed spheres |

---

## 3. Zones

### What a zone shows
- **Title** above the zone: space name in spaced capitals (13 px / 500, `+0.22em`) in the space's text colour, and the kind-specific subtitle (10 px). Titles always stay at least 24 px below the canvas top when the camera frames a zone.
- **Floor disc**: a radial gradient in the space hue (alpha 0.05 at the centre, fading to 0) plus a 1 px hairline at 0.10. Inactive zones are drawn at ×0.4.
- **Hub**: a small glowing sphere (radius 0.3, intensity 1.6) in the space hue. **Clicking the hub makes that space active.**
- **Goal arc** (goals only): a thin ring around the hub at 40% opacity that fills clockwise from 12 o'clock with the completed fraction. Kept below the bloom threshold.
- **Active zone**: title fully opaque, lines at 0.22 opacity; inactive zones are dimmed (title 55%, lines 0.10). The nebula takes at most 8% of the active space's hue.

### How zones are arranged in space
`computeLayout()` in `src/scene/layout.ts`:

1. Find the space with the most visible tasks; every zone gets the same cell so the grid stays regular:
   `zoneRadius = spiralRadius(maxTaskCount) + 1.2`
2. Cell size: `cell = zoneRadius × 2 + CONSTELLATION.zoneGap` (`zoneGap = 2.5`).
3. Columns: `ceil(√spaceCount)`: 4 spaces → 2×2, 5–9 spaces → 3 columns.
4. Positions are staggered so it reads as a sky, not a spreadsheet:
   - `x = col × cell × 1.15 + (row is odd ? cell × 0.45 : 0)`
   - `y = −row × cell × 0.9`
5. The first space in display order is always at the origin `(0, 0)`.

The camera can pan anywhere inside the bounding box of all zones plus `CAMERA.boundsMargin` (8 units).

---

## 4. Task spheres

Component: `src/scene/objects/TaskOrb.tsx`.

### Anatomy
```
   ╭───────────╮   ← glass shell: transmissive, clearcoated, tinted by the space hue
   │     ●     │   ← glowing core: space core colour, brightness = priority
   ╰───────────╯
  ◜─────────────◝  ← extras: halo (P2), equatorial ring (P3), overdue ring, selection ring
   Task title       ← DOM label: title (max 2 lines, 150 px), due date, up to 2 tags
   Today · #tag
```

- **Glass shell**: `MeshPhysicalMaterial`, `ior 1.45`, attenuation in the space hue. Iridescence is kept low (0.25) because an oil-film sheen adds hues that aren't the space's.
- **Core**: unlit material in the space core colour; intensity above 1 feeds bloom. ACES tone mapping runs once at the end of the post chain, so cores glow without clipping to white.

### Priority, without colour
| Priority | Radius | Core intensity | Roughness | Transmission | Extra |
|---|---|---|---|---|---|
| 0 None | 0.46 | 0.8 | 0.38 | 0.88 | — |
| 1 Low | 0.55 | 1.5 | 0.18 | 0.95 | — |
| 2 Medium | 0.66 | 2.6 | 0.06 | 1.0 | inner halo, 1.15× core at 25% |
| 3 High | 0.78 | 3.8 | 0.03 | 1.0 | equatorial ring in the core colour; breathes ×(1 ± 0.12) at 0.45 Hz |

Bigger, brighter and glassier means more urgent. A low-priority sphere is small, dim and slightly frosted; a high-priority one is large, clear and ringed. The ordering holds in grayscale (`npm run test:visual` asserts core luminance rises P0 < P1 < P2 < P3).

Breathing only runs while ambient motion is on, the window is focused, and the OS isn't asking for reduced motion. It never forces continuous rendering on its own.

How to set priority:
- Quick add: `!1`, `!2`, `!3` (or `!low`, `!med`, `!high`), e.g. `Pay rent !3 #bills`.
- Select a sphere and press `P` to cycle None → Low → Medium → High → None.
- Editor panel (`Enter` / double-click): the Priority control.

### States
| State | Trigger | Visual |
|---|---|---|
| Idle | — | Floats gently in place |
| Hover | Mouse over | Scale ×1.14, core ×1.25, label shown |
| Pressed | Mouse down | Scale ×0.9 (0.06 s squish) |
| Selected | Click / `↑↓` / palette | Scale ×1.24, moves 0.6 toward the camera, core ×1.4, ring in the space hue, label shown; camera flies to it |
| Overdue | Due date passed, not done | Thin ring in `#D4705F` at 70%, slowly rotating; label always shown, date in the alert colour |
| Completed | Check on the label / selection bar / `Space` / editor | Shockwave ring in the space hue (0.7 s, peak 0.5, ease-out). Then: colour mix(base, `#6B7280`, 0.75), core 0.4, roughness 0.45, radius 0.40, title struck through at 45% |
| Locked | Its blocker is not done | Full space hue at 0.92× radius, core ×0.18, roughness 0.62, transmission 0.55, two crossing latitude bands in the dim hue, float ×0.25. Halo and high-priority ring suppressed; the overdue ring is kept |
| Unlocking | Its blocker was completed | The bands scale out to 2.2× and fade over 0.55 s, and a dot travels the link from blocker to successor |
| Entering | Task created / app start | Grows from nothing and rises out of depth, 40 ms stagger |

Locked has to be unmistakable from the two states it could be confused with, so it moves the axes in the opposite direction from each. Against **completed** (desaturated toward grey, shrunk below priority 0) it keeps full hue at near-full size and seals the glass, so it reads solid rather than hollow. Against **low priority** (small and dim) it is large, dark and caged. Size therefore still means priority and nothing else.

Completion wins over the lock on the sphere itself: a task completed out of turn reads as done, and the unresolved sequence shows on its incoming link instead.

Hide completed tasks with `H` (or the sidebar toggle).

### Labels
Labels are DOM text at a constant size (12 px / 500 title, 10.5 px meta, Inter bundled in `public/fonts/`), shadowed `0 1px 3px rgba(0,0,0,.85)`. A label is shown when **any** of these is true:

- the sphere is selected or hovered;
- the task is high priority or overdue;
- it is in the active space and the camera is closer than 32 units.

Labels fade with camera distance (smoothstep between 26 and 42; sized against the distance it takes to frame the largest single zone, since a space holding a chain is taller than one holding the same tasks loose) and take 150 ms to fade in or out. A screen-space pass (`LabelCuller` in `src/scene/labels.ts`) hides the lower-ranked of any two overlapping labels. Rank: selected > hovered > priority > overdue. The pass considers at most 60 labels and is skipped while the camera moves fast. Visibility is written straight to `style.opacity` from `useFrame`, never through React state.

### Interaction summary
| Action | Result |
|---|---|
| Click sphere | Select it (and make its space active) — only ever this |
| Check on the label | Complete / reopen. The label layer is transparent to the pointer; this control is the one thing in it that is not |
| Double-click sphere | Open the editor panel |
| Click hub | Make that space active |
| Click empty space | Deselect |
| `↑` / `↓` (or `J` / `K`) | Select previous/next task in the active space |
| `Alt+↑` / `Alt+↓` | Move among siblings, carrying the subtree |
| `L` | Pick what this task comes after |
| `Del` | Delete (toast offers Undo) |
| `?` | All shortcuts, grouped Navigation / Tasks / Spaces / View |

A drag never counts as a click: if the pointer moves more than 5 px between press and release, the release is ignored (`pointerState.dragged` in `src/scene/interaction.ts`).

---

## 5. How spheres are placed inside a zone

### Order
`orderTasks()` (`src/state/store.ts`) walks open tasks depth-first so every chain comes out contiguous — a blocker immediately followed by its subtree — then completed tasks, most recent first (only if "Show completed" is on). New tasks get the lowest position, so **the newest loose task sits closest to the hub**.

This single order drives the spiral, `↑`/`↓` selection, label ranking and `Alt+↑`/`Alt+↓`. A separate ordering track for chains would mean two different answers to "what comes next".

### Golden-angle spiral
Task `i` (0-based) in a zone with centre `(cx, cy)`:

```
r     = spiralSpacing × √(i + spiralStart)        // 1.95 × √(i + 1.1)
angle = spaceSpin + i × 137.5°                     // golden angle
x     = cx + cos(angle) × r × ellipseX              // ellipseX = 1.25 (wider than tall)
y     = cy + sin(angle) × r
z     = (hash(taskId) − 0.5) × depthJitter          // ±0.9 depth variation
```

This is the sunflower-seed pattern: spheres never overlap, the cluster grows evenly, and adding a task barely disturbs the rest. `spaceSpin` is a per-space hash so zones don't look identical. Moving a task to another space in the editor makes its sphere fly across space into the new zone.

Only **unchained** tasks sit on the spiral. Chained ones have their own track (below), and the spiral is indexed over the loose tasks alone, so it stays dense.

### Chain arms
A chain winds around the hub as a necklace in the annulus just outside the spiral:

```
armStart = spiralRadius(looseCount) + bandClearance
r        = armStart + stepRadius × depth ^ 0.72     // radius from depth
angle    = armSpin + curl × walkIndex               // angle from depth-first position
```

`walkIndex` is the task's position in a depth-first walk of the chain. Giving every chained task its own angular slot is what makes this collision-free: two tasks can share a radius only at different angles, and an angle only at different radii. `curl` narrows automatically when a zone holds many chained tasks, so they still fit within one turn.

Angle does nearly all the work and radius almost none, which is what keeps a chain compact. Two earlier designs failed and are worth not repeating:

- An arm marching straight outward spiked into one wedge, left most of the zone empty, and forced the camera back far enough to shrink every sphere.
- Allocating angle by fork — splaying branches around a shared centre — let a deep step on one branch drift onto a shallow step of its neighbour, because the per-depth winding outgrew the per-fork splay.

The walk is computed in `placeZone`, not taken from display order, because display order sends completed tasks to the end: a step finished out of turn would be flung to the far side of the ring, breaking the sequence and dragging its links across the zone.

### Floating
With ambient motion on, each sphere bobs around its rest position on three sine waves (amplitude `[0.16, 0.22, 0.14]`, speed `[0.55, 0.42, 0.37]` rad/s, phases from the task id).

---

## 6. Light lines

Component: `src/scene/objects/Constellation.tsx`. Two sets of lines, and the distinction matters.

**Decorative tree.** Each *loose* sphere connects to the nearest of: the hub, or any loose sphere earlier in the order. A crossing-free tree, space hue at 0.22 opacity (active) or 0.10 (inactive), slightly brighter at the parent end, following the floating spheres every frame. It carries no data. Chained spheres are excluded — they already read as a sequence, and a second line over them would compete with the real one.

**Dependency links.** One line per `blockedBy`, drawn with direction:

- a brightness gradient, bright at the blocker and fading toward the successor — the energy has reached the blocker, it has not yet reached you;
- a **static** chevron at 0.62 along the link pointing at the successor. Static is the point: under `frameloop="demand"` it costs nothing when nothing else moves, which is why the chevron carries direction and motion does not;
- a flow dot that slides blocker → successor, **only on unlocked links and only while ambient motion is on**. A locked link never moves; the stillness is the "gate closed" read.

Three draw calls per zone regardless of how many links there are. No link introduces a new colour — every layer is the space hue.

---

## 7. Camera and navigation

Component: `src/scene/CameraRig.tsx`.

| Input | Effect |
|---|---|
| Drag (left or middle button) | Pan; release with speed → momentum (`MOTION.panFriction = 4.5`) |
| Mouse wheel | Zoom (distance 7–42, default 19) |
| `Shift` + wheel | Pan horizontally |
| Mouse position | Camera sways up to 1.1 × 0.7 units → parallax |
| Select a task | Camera flies to that sphere |
| Choose a space (sidebar, `Ctrl+←/→`, `Ctrl+1…9`, hub click) | Camera flies to that zone, framed so the title clears the top edge by 24 px and the zone clears the quick-capture bar. Choosing the already-active space re-centres on it |

Zone framing also sets the distance (`fitDistance`), because zones are no longer all much the same size — a space holding a long chain is taller than one holding the same tasks loose, and at a fixed distance it ran off the bottom edge. It only ever pulls *back*: a space the user has zoomed into stays where they put it, but choosing a space always shows the whole of it.

---

## 8. Background

Component: `src/scene/objects/ParallaxBackground.tsx`. Nothing is loaded from disk or network; every texture is computed at startup from a seeded random generator.

| Layer | Depth (z) | Content |
|---|---|---|
| Backdrop | −110 | Opaque neutral gradient (`#0A0C11` → `#131823`), soft grey blobs, vignette 0.35. Half-float texture (no 8-bit banding). Also what the glass refracts |
| Far / near nebula | −70 / −38 | Transparent grey cloud layers (alpha 0.10), ≤ 8% of the active space's hue |
| Stars | −95 … −30 | 700 / 1500 / 2600 points, `#FFF3E0` / `#DCE7FF` at 35–70% |
| Dust | −6 … +5 | 420 faint particles, slow drift |

Post-processing (High/Medium): bloom (intensity 0.55, threshold 0.88, smoothing 0.4, radius 0.72), chromatic aberration 0.0006 (High only), vignette (offset 0.25, darkness 0.45), ACES tone mapping at exposure 1.0, SMAA. Low has no post chain; the renderer applies ACES itself.

---

## 9. Performance rules

- **Ambient motion** (floating, breathing, drift) renders continuously **only while the window is focused and visible**. Otherwise the canvas renders on demand, so an idle background window draws nothing (`npm run test:visual` asserts zero draw calls).
- Windows "reduce animations" (`prefers-reduced-motion`) disables floating, breathing and the shockwave and makes transitions instant.
- Geometries are shared by all spheres; materials are per-sphere and disposed on removal.
- Glass uses `MeshPhysicalMaterial` transmission (one shared transmission pass), not drei's `MeshTransmissionMaterial`.
- Quality tiers (Settings): **High** = bloom + chromatic aberration + SMAA, 48-segment spheres; **Medium** = bloom + SMAA, 32; **Low** = no post-processing, 24.

---

## 10. File map

| File | Responsibility |
|---|---|
| `src/contracts/tokens.ts` | Every colour, size, timing and layout constant (`PALETTE`, `RAMP`, `UI`, `TYPE`, `MOTION`, `MATERIALS`, `CONSTELLATION`, `CHROME`, `CAMERA`, `PARALLAX`, `QUALITY`, `EFFECTS`) |
| `src/ui/theme.ts` | Publishes tokens as CSS custom properties for the stylesheets |
| `src/scene/layout.ts` | Zone grid, golden-angle spiral, constellation tree, pan bounds |
| `src/scene/Scene.tsx` | The canvas; camera focus; continuous vs on-demand rendering |
| `src/scene/CameraRig.tsx` | Drag / momentum / zoom / sway / fly-to with title framing |
| `src/scene/labels.ts` | Label registry and the visibility / fade / collision culler |
| `src/scene/objects/TaskOrb.tsx` | One task sphere: glass, core, halo, rings, shockwave, label |
| `src/scene/objects/Constellation.tsx` | One zone: disc, hairline, hub, goal arc, lines, title |
| `src/scene/objects/ParallaxBackground.tsx` | Backdrop, nebulae, stars, dust |
| `src/scene/effects/Composer.tsx` | Bloom, chromatic aberration, vignette, ACES, SMAA |
| `src/scene/materials/materials.ts` | Space ramp, material factories, shared geometries, procedural textures |
| `src/app/App.tsx` | Groups tasks per space and passes them to the scene |

The scene never imports the store or the database (`src/state`, `src/data`); it only renders what `App.tsx` passes in.

---

## 11. Common changes

| I want to… | Change |
|---|---|
| Make high-priority spheres bigger | `MATERIALS.priority[3].radius` |
| Make priorities brighter / dimmer overall | `MATERIALS.priority[p].coreIntensity` |
| Cores look washed out | Lower `RAMP.core.amount` (core lightness), not the hue chroma |
| Breathing is distracting | `MOTION.breathe.amount: 0` (the ring stays, static) |
| Zone floor looks muddy | `MATERIALS.zoneDisc.centerAlpha: 0` (hairline only) |
| Spread spheres further apart | `CONSTELLATION.spiralSpacing` |
| Put zones closer / further apart | `CONSTELLATION.zoneGap` |
| Calmer or livelier floating | `MOTION.float.amplitude` / `MOTION.float.speed` |
| Show labels from further away | `CAMERA.labelDistance` / `CAMERA.labelFade` |
| Longer completion shockwave | `MOTION.burst.seconds` |
