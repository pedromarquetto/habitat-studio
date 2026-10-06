# v0.1 verification

## Automated

Eight domain regression tests pass: building generation and JSON round-trip; rotated wall/door collision; window barriers and opening overlap rejection; hosted openings after wall transformations/deletion; stair ascent/descent and prevention of upper-floor teleportation; floor duplication; malformed project rejection; and room bounds/spawn collision avoidance.

TypeScript checking and ESLint pass for the application, editor and engine.

## Browser

Verified on the desktop internal preview:

- The procedural residential building renders in both orbit view and orthographic floor plan.
- A room in Apto 101 can be renamed while Apto 102 preserves its original name.
- Undo and redo restore the visible document.
- Furniture placement snaps to 0.25 m; deletion, undo and redo update the scene.
- The room drawing tool creates a slab and four walls from two clicks.
- Walking mode displays the building interior.
- Direction buttons move the player; the visible coordinates update.
- Direct access to the upper floor sets the player's feet to 3.20 m.
- Browser-local autosave displays its saved state.

## Scope of verification

The test browser has WebGL disabled. Visual and UI checks therefore exercised the real SVG compatibility renderer; hardware-accelerated WebGL rendering remains to be checked on a GPU-enabled browser. Pointer-lock mouse look and held-key/touch input require interactive verification. The standard desktop preview does not offer a viewport-resize capability, so mobile layout was reviewed in source only.

The test context did not expose registered WebMCP tools. The optional bridge is feature-detected, but its registration/runtime integration could not be verified here. JSON structure/round-trip validation is automated; browser download/import permission handling still requires manual verification.
