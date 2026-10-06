# Architecture

## Document, editor, and renderer

The JSON document is the source of truth. Each entity owns a stable UUID, a floor reference, metric coordinates, dimensions, rotation, material color, and an optional apartment label. Floors provide elevation in meters. All editing actions create a new document and validate it before entering the undo history.

The React editor owns project state, active floor, selections, tools, and history. The Three.js engine owns transient camera state, picking, preview geometry, player movement, and GPU resources. The document does not store Three.js objects and can be exported without rendering state.

Models use local X for width, local Z for depth, Y for height, and degrees for serialized yaw. Door/window entities reference their host wall. Moving or rotating the wall transforms its openings while preserving their local offsets. Deleting a wall deletes its openings. Validation rejects dangling floor/host references, invalid dimensions, overlapping openings, and openings outside the wall.

## Walking

The player uses a 0.22 m collision radius and 1.65 m eye height. Movement is subdivided into at most 0.08 m increments to avoid crossing thin walls during a long frame. Rotated obstacles are tested in local space. Wall collision permits only a doorway wide/tall enough for the player; window openings remain blocked.

Ground support is evaluated from floor slabs and stair ramps at the player's feet. A higher slab cannot snap a player upward when they stand beneath it. Steps are visualized individually; the support surface is continuous for smooth climbing. An editable room provides a rectangular slab. The building generator reserves an open stair shaft, top landings and side circulation.

## Persistence

Version 1 JSON projects use meters and a Zod schema. Projects are autosaved to `habitat-studio:project:v1` in localStorage after a 500 ms delay. Import validates the full document and limits file size to 5 MB before replacing it. Export contains the canonical document only. Import, generation, and blank projects are reversible through undo.

There is no remote project database in v0.1. A future cloud repository can wrap the same document operations without making the renderer responsible for persistence.

## Rendering and resources

The engine loads only on the browser. WebGL renders lit procedural meshes with shadows. The compatibility path uses Three.js SVGRenderer when WebGL cannot be created, shares the same cameras and geometry, and draws on demand at a maximum of 15 fps. Compatibility rendering omits the infinite ground plane and texture-based labels to avoid painter-order artifacts; functional room labels use SVGObject.

Removed model geometries, materials and label textures are disposed. Event listeners, animation frames, controls, resize observers and the renderer are released when the viewport unmounts.

## Agent interoperability

Where the browser implements `document.modelContext`, the same editor exposes `read_habitat_project`, `set_habitat_view`, and `add_habitat_objects`. The bridge is feature-detected and does not depend on a backend or AI API. Mutation tools validate inputs and use the same editor action and history as the visible controls.
