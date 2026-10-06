# Habitat Studio

A web-based 3D building editor. Draw rooms and walls, furnish individual apartments, create multiple floors, and walk through your own building.

[Open the web app](https://habitat-studio.plcm90902.chatgpt.site)

![Habitat Studio editor](docs/habitat-studio.jpg)

## First version

- Metric 3D editor and orthographic floor plan, with a 0.25 m snapping grid.
- Wall and room drawing. A room tool creates a floor slab and four walls.
- Hosted doors and windows: openings are cut in the wall geometry. Doors remain open for walkthroughs.
- Gabled roofs, stairs, sofas, armchairs, beds, tables, chairs, cabinets, plants, lamps, refrigerators, stoves, sinks, and toilets.
- Property inspector for names, apartment grouping, position, rotation, dimensions, and colors.
- Floor isolation and wall cutaway; empty and duplicated floors.
- A generated residential building with two apartments per floor, room partitions, furniture, stairs, and a roof.
- First-person exploration with wall/furniture collision and traversable stairs.
- Undo/redo, browser-local autosave, validated JSON import/export.
- Click-and-drag mouse look, keyboard look, and touch movement controls. Releasing the left mouse button immediately stops turning; the cursor stays available.
- A compact walking-mode mouse sensitivity slider (25–200%), remembered in the current browser.
- Automatic lightweight SVG compatibility rendering when WebGL is unavailable. WebGL is the preferred renderer.

## Run locally

Requires Node.js 22.13+ and pnpm 11+. No API keys or paid services are required.

```sh
corepack enable
pnpm install
pnpm dev
```

Open the address printed by the development server. The application runs in a browser; there is no desktop client.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The included Vinext configuration uses React, TypeScript, Three.js, and Vite with Next.js App Router conventions. The UI and 3D engine execute on the client; the server serves the application shell. The standard build targets Cloudflare Workers.

## How to use

1. Open the included **Residencial Aurora** example or choose **Projeto em branco**.
2. Select **Parede**, **Cômodo**, or **Telhado**, then click two points in the viewport.
3. Select **Porta** or **Janela** and click a wall on the active floor.
4. Choose a furniture/appliance item and click the floor. Press **R** to rotate before placement.
5. Select an object to change its meter coordinates, dimensions, color, name, or apartment.
6. Use the floors panel to add, duplicate, or select a floor. **Gerar prédio** creates one to eight furnished floors.
7. Switch to **Caminhar** to enter the active floor or selected room. Use **WASD** to walk and **Shift** to move faster. Hold the left mouse button and drag to look; release it to stop turning. Arrow keys also look around. Adjust **Sensibilidade** in the lower-right corner (25–200%). Stairs connect floors; the floor buttons provide direct access.
8. Use **Exportar** to back up the project or move it to another browser.

| Shortcut | Action |
| --- | --- |
| V | Selection tool |
| R | Rotate selected object or placement preview by 90° |
| Delete / Backspace | Delete selected object |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + S | Save in the current browser |
| Esc | Cancel drawing / stop camera drag |
| WASD | Walk |
| Shift | Walk faster |
| Arrow keys | Look around in walking mode |

## Architecture

- `lib/habitat/domain.ts`: versioned document schema, generators, hosted openings, collision, movement and floor support. Independent of rendering and React.
- `lib/habitat/models.ts`: procedural 3D geometry and material/resource lifecycle.
- `lib/habitat/engine.ts`: cameras, orbit and walking controls, picking, previews and renderers.
- `lib/habitat/walk-controls.ts`: primary-pointer drag ownership and normalized mouse/touch sensitivity.
- `components/habitat/Studio.tsx`: editor actions, history, property panels and persistence.
- `components/habitat/Viewport.tsx`: client-side renderer lifecycle and graceful failure handling.
- `tests/domain.test.mjs`: meaningful regression coverage for geometry references, collision, stairs, imports, and floor cloning.
- `tests/walk-controls.test.mjs`: regression coverage for mouse hover/release, pointer ownership, cancellation, sensitivity, and touch look.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Current boundaries

This is a first usable prototype, not a professional CAD/BIM system. Models use procedural low-poly geometry. Room walls do not automatically merge with neighboring rooms; walls and floor slabs are independent editable objects. The apartment field groups objects but does not enforce physical containment. Roofs use a simple gable profile with a fixed base at 2.95 m above their assigned floor. Stairs follow a continuous support ramp matching their visible steps, without gravity, jumping, or head collision. There is no structural engineering calculation, DXF/IFC import, photorealistic asset library, cloud account, shared project storage, or collaboration yet.

Browser-local data can disappear if site data is cleared. JSON export is the portable backup format. Large buildings are bounded by 20 floors and 5,000 entities; the SVG compatibility renderer has less visual fidelity and lower performance than WebGL.
