# woTask — Regions, Spheres & Constellation Design

How the 3D view works: what every sphere, line and zone means, how region, priority and completion are encoded, how regions are laid out, and how to change any of it.

All numbers below come from `src/contracts/tokens.ts`. Change them there, never in components.

---

## 1. The mental model

The whole app is a small universe:

| On screen | Represents | Data |
|---|---|---|
| **Zone** (a patch of space with a faint floor disc and a title) | One **region**: a category, project or goal | `Region` in `src/contracts/task.ts` |
| **Hub** (small glowing sphere at the centre of a zone) | The region itself, its anchor point | `Region.colorIndex` |
| **Task sphere** (glass ball with a glowing core) | One **task** | `Task` |
| **Light lines** | Which tasks belong to which region | derived, not stored |
| **Label under a sphere** | Task title, due date, tags | DOM text (never WebGL) |
| **Background** (stars, nebula, dust) | Nothing; pure atmosphere and depth cues | procedural, no files |

You never "open" a region in the 3D view. Every region is always present as its own zone; choosing a region flies the camera to it.

### The colour rule

> **Hue = region. Everything else = priority. Desaturation = completed.**

A sphere's colour tells you *where* a task lives, never how urgent it is. Urgency is carried by size, core brightness, finish and extras (halo, ring), all of which survive a grayscale screenshot.

---

## 2. Regions

### Kinds
| Kind | Use it for | Zone subtitle |
|---|---|---|
| **Category** | Ongoing areas with no end (পড়াশোনা, Backlog, Home) | `N open · M done` |
| **Project** | Finite pieces of work (Product Launch) | `N open · M done` |
| **Goal** | Outcomes with a target date (Health: run a 10K) | `N of T complete · D days left`, plus a progress arc around the hub |

Fields: name (1–80 chars), kind, optional one-line purpose (≤ 200 chars), colour (one of 8 hues), optional target date (goals), archived flag.

Sidebar, `Ctrl+1…9`, `Ctrl+←/→` and the zone grid all use the same display order: projects first, then goals, then categories, each group by position (`visibleRegions()` in `src/state/store.ts`).

### Lifecycle
- **First run** shows the onboarding card ("What are you working on?"): name, kind and colour. There is no seeded Inbox. Development builds (`npm run dev`) seed four demo regions instead: Product Launch (project), Health (goal, 45 days out), পড়াশোনা (category), Backlog (category).
- **New region**: `+ New region` in the sidebar, `Ctrl+Shift+N`, or the command palette.
- **Edit**: hover a sidebar row and press `⋯`. Changes save as you type.
- **Archive** hides a region and its zone but keeps its tasks; restore it from *Archived* at the bottom of the sidebar.
- **Delete** removes the region **and its tasks** (`Ctrl+Z` undoes). The last remaining region can't be deleted; the sidebar explains why inline.

### Region colour
Eight muted hues, deliberately equal in lightness and chroma (OKLCH, verified by `npm run test:palette`) so no region shouts louder than another:

`#7490BD` `#5F9E8F` `#C09562` `#B57D8E` `#8E83BC` `#6B9DB0` `#B9796B` `#8EA06E`

New regions take the next unused hue. Each hue expands into a ramp (`regionRamp()` in `src/scene/materials/materials.ts`, amounts in `RAMP`):

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
- **Title** above the zone: region name in spaced capitals (13 px / 500, `+0.22em`) in the region's text colour, and the kind-specific subtitle (10 px). Titles always stay at least 24 px below the canvas top when the camera frames a zone.
- **Floor disc**: a radial gradient in the region hue (alpha 0.05 at the centre, fading to 0) plus a 1 px hairline at 0.10. Inactive zones are drawn at ×0.4.
- **Hub**: a small glowing sphere (radius 0.3, intensity 1.6) in the region hue. **Clicking the hub makes that region active.**
- **Goal arc** (goals only): a thin ring around the hub at 40% opacity that fills clockwise from 12 o'clock with the completed fraction. Kept below the bloom threshold.
- **Active zone**: title fully opaque, lines at 0.22 opacity; inactive zones are dimmed (title 55%, lines 0.10). The nebula takes at most 8% of the active region's hue.

### How zones are arranged in space
`computeLayout()` in `src/scene/layout.ts`:

1. Find the region with the most visible tasks; every zone gets the same cell so the grid stays regular:
   `zoneRadius = spiralRadius(maxTaskCount) + 1.2`
2. Cell size: `cell = zoneRadius × 2 + CONSTELLATION.zoneGap` (`zoneGap = 2.5`).
3. Columns: `ceil(√regionCount)`: 4 regions → 2×2, 5–9 regions → 3 columns.
4. Positions are staggered so it reads as a sky, not a spreadsheet:
   - `x = col × cell × 1.15 + (row is odd ? cell × 0.45 : 0)`
   - `y = −row × cell × 0.9`
5. The first region in display order is always at the origin `(0, 0)`.

The camera can pan anywhere inside the bounding box of all zones plus `CAMERA.boundsMargin` (8 units).

---

## 4. Task spheres

Component: `src/scene/objects/TaskOrb.tsx`.

### Anatomy
```
   ╭───────────╮   ← glass shell: transmissive, clearcoated, tinted by the region hue
   │     ●     │   ← glowing core: region core colour, brightness = priority
   ╰───────────╯
  ◜─────────────◝  ← extras: halo (P2), equatorial ring (P3), overdue ring, selection ring
   Task title       ← DOM label: title (max 2 lines, 150 px), due date, up to 2 tags
   Today · #tag
```

- **Glass shell**: `MeshPhysicalMaterial`, `ior 1.45`, attenuation in the region hue. Iridescence is kept low (0.25) because an oil-film sheen adds hues that aren't the region's.
- **Core**: unlit material in the region core colour; intensity above 1 feeds bloom. ACES tone mapping runs once at the end of the post chain, so cores glow without clipping to white.

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
| Selected | Click / `↑↓` / palette | Scale ×1.24, moves 0.6 toward the camera, core ×1.4, ring in the region hue, label shown; camera flies to it |
| Overdue | Due date passed, not done | Thin ring in `#D4705F` at 70%, slowly rotating; label always shown, date in the alert colour |
| Completed | Click a selected sphere / `Space` / editor | Shockwave ring in the region hue (0.7 s, peak 0.5, ease-out). Then: colour mix(base, `#6B7280`, 0.75), core 0.4, roughness 0.45, radius 0.40, title struck through at 45% |
| Entering | Task created / app start | Grows from nothing and rises out of depth, 40 ms stagger |

Hide completed tasks with `H` (or the sidebar toggle).

### Labels
Labels are DOM text at a constant size (12 px / 500 title, 10.5 px meta, Inter bundled in `public/fonts/`), shadowed `0 1px 3px rgba(0,0,0,.85)`. A label is shown when **any** of these is true:

- the sphere is selected or hovered;
- the task is high priority or overdue;
- it is in the active region and the camera is closer than 24 units.

Labels fade with camera distance (smoothstep between 20 and 34) and take 150 ms to fade in or out. A screen-space pass (`LabelCuller` in `src/scene/labels.ts`) hides the lower-ranked of any two overlapping labels. Rank: selected > hovered > priority > overdue. The pass considers at most 60 labels and is skipped while the camera moves fast. Visibility is written straight to `style.opacity` from `useFrame`, never through React state.

### Interaction summary
| Action | Result |
|---|---|
| Click sphere | Select it (and make its region active) |
| Click selected sphere again | Toggle complete |
| Double-click sphere | Open the editor panel |
| Click hub | Make that region active |
| Click empty space | Deselect |
| `↑` / `↓` (or `J` / `K`) | Select previous/next task in the active region |
| `Alt+↑` / `Alt+↓` | Reorder the selected task |
| `Del` | Delete (toast offers Undo) |
| `?` | All shortcuts, grouped Navigation / Tasks / Regions / View |

A drag never counts as a click: if the pointer moves more than 5 px between press and release, the release is ignored (`pointerState.dragged` in `src/scene/interaction.ts`).

---

## 5. How spheres are placed inside a zone

### Order
`orderTasks()` (`src/state/store.ts`): open tasks by `position` (your manual order), then completed tasks, most recent first (only if "Show completed" is on). New tasks get the lowest position, so **the newest task sits closest to the hub**.

### Golden-angle spiral
Task `i` (0-based) in a zone with centre `(cx, cy)`:

```
r     = spiralSpacing × √(i + spiralStart)        // 1.95 × √(i + 1.1)
angle = regionSpin + i × 137.5°                     // golden angle
x     = cx + cos(angle) × r × ellipseX              // ellipseX = 1.25 (wider than tall)
y     = cy + sin(angle) × r
z     = (hash(taskId) − 0.5) × depthJitter          // ±0.9 depth variation
```

This is the sunflower-seed pattern: spheres never overlap, the cluster grows evenly, and adding a task barely disturbs the rest. `regionSpin` is a per-region hash so zones don't look identical. Moving a task to another region in the editor makes its sphere fly across space into the new zone.

### Floating
With ambient motion on, each sphere bobs around its rest position on three sine waves (amplitude `[0.16, 0.22, 0.14]`, speed `[0.55, 0.42, 0.37]` rad/s, phases from the task id).

---

## 6. Light lines

Component: `src/scene/objects/Constellation.tsx`. Each sphere connects to the nearest of: the hub, or any sphere earlier in the order. The result is a crossing-free tree with one line per task. Lines use the region hue at 0.22 opacity (active) or 0.10 (inactive), slightly brighter at the parent end, and follow the floating spheres every frame. They carry no data.

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
| Choose a region (sidebar, `Ctrl+←/→`, `Ctrl+1…9`, hub click) | Camera flies to that zone, framed so the title clears the top edge by 24 px and the zone clears the quick-capture bar. Choosing the already-active region re-centres on it |

---

## 8. Background

Component: `src/scene/objects/ParallaxBackground.tsx`. Nothing is loaded from disk or network; every texture is computed at startup from a seeded random generator.

| Layer | Depth (z) | Content |
|---|---|---|
| Backdrop | −110 | Opaque neutral gradient (`#0A0C11` → `#131823`), soft grey blobs, vignette 0.35. Half-float texture (no 8-bit banding). Also what the glass refracts |
| Far / near nebula | −70 / −38 | Transparent grey cloud layers (alpha 0.10), ≤ 8% of the active region's hue |
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
| `src/scene/materials/materials.ts` | Region ramp, material factories, shared geometries, procedural textures |
| `src/app/App.tsx` | Groups tasks per region and passes them to the scene |

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
