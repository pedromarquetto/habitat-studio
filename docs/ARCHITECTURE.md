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

There is no remote project database. A future cloud repository can wrap the same document operations without making the renderer responsible for persistence.

## Rendering and resources

The engine loads only on the browser. WebGL renders lit procedural meshes with shadows. The compatibility path uses Three.js SVGRenderer when WebGL cannot be created, shares the same cameras and geometry, and draws on demand at a maximum of 15 fps. Compatibility rendering omits the infinite ground plane and texture-based labels to avoid painter-order artifacts; functional room labels use SVGObject.

Removed model geometries, materials and label textures are disposed. Event listeners, animation frames, controls, resize observers and the renderer are released when the viewport unmounts.

## Penthouse and suspended objects

`addPenthouse` derives the footprint from the highest floor's rooms/walls, validates supported dimensions and floor limits, then appends a distinct floor 3.2 m higher. It replaces only that floor's pitched roofs and keeps all other existing entity identities. Slabs are split around the incoming stair shaft. The stair's upper edge touches the landing exactly; the apartment and terrace slabs also meet at their doorway. Both connections are exercised with continuous player movement tests. Apartment partitions use normal hosted doors/windows. Railings collide, while the central pergola footprint stays traversable and its posts collide.

An entity's optional `y` is the base elevation relative to its floor; omitted means zero. Rendering, placement previews, movement/rotation previews and body collision use it. Existing version-1 JSON remains valid. Upper-floor landscaping stays on the active floor; only the lot tool targets the ground floor.

## Real mode

Real mode is presentation state, separate from the document and undo history. It uses the same meshes, dimensions, collision and walking controller. Five small shared DataTextures provide repeatable wood, stone, fabric, metal and paint surface patterns and bump detail. Explicit entity finishes override catalog defaults; transparent glass retains its glass material. Box UVs follow meter dimensions. Model disposal releases local resources without disposing shared maps; the engine owns and releases the shared texture cache.

Hardware rendering uses a cached PMREM environment from RoomEnvironment, directional shadows, tone-mapping exposure and up to 16 active light sources on the player's current floor. Day/night changes rebuild presentation without modifying the project. The walking loop changes light floors as the player's feet cross elevations. Renderer teardown disposes the PMREM target and surface textures. SVG mode shows the same geometry with reduced lighting fidelity and a visible WebGL-unavailable notice; it cannot show texture/bump maps, reflections or GPU shadows.

## Agent interoperability

Where the browser implements `document.modelContext`, the same editor exposes `read_habitat_project`, `set_habitat_view`, and `add_habitat_objects`. The bridge is feature-detected and does not depend on a backend or AI API. Mutation tools validate inputs and use the same editor action and history as the visible controls.

## Outdoor projects

`projectType` is optional for backward compatibility. House, building and terrain starters use the same version-1 document. Flat terrain/lawn/paving are layered beneath floor slabs. Fences block movement, gate openings remain traversable, trees collide at their trunks, and pools block walking into the water. These tools model flat lots; terrain grading and earthworks are not implemented. Duplicating a floor excludes outdoor catalog entities.

## Product import

`POST /api/products/import` accepts one public HTTP(S) page URL. The server rejects IP literals, credentials, internal domains and nonstandard ports, checks A/AAAA records through public DNS, validates each redirect, limits HTML to 2 MiB and uses a 12-second timeout. The URL and network boundary are independent of parsing. Outbound requests use the platform fetch implementation; there are no user-supplied cookies or credentials. Production access continues to follow the existing Site audience.

The parser reads explicit metric/imperial units and axis labels. Product dimensions are distinct from offer/shipping dimensions. Known storefront data is restricted to the primary product subtree. Numeric ranges or values without units remain missing for user review. Copied specifications use the same parser locally and are recorded as manual input. Storefronts requiring JavaScript, sign-in, or bot checks may require this fallback.

Entities optionally hold `product` provenance: source URL/photo, brand/model, confirmed dimensions in meters, measurement source and evidence. This preserves old project compatibility. Imported model bounds are normalized to exactly match the confirmed width, height and depth; an arbitrary product URL is not treated as a 3D asset. The numeric inspector preserves precision instead of rounding imported measures to centimeters on focus/blur.

## Object movement

`MoveGesture` distinguishes primary presses, seven-pixel pre-hold jitter, navigation and movement. A 450 ms hold activates object movement in selection mode; the explicit Move tool activates it immediately. Captured pointer movement runs before OrbitControls document listeners. Controls disconnect during object movement and reconnect when it ends; pointer capture handles drops outside the viewport. Floor-plan left drags and one-finger drags pan when navigating.

The engine projects onto the active floor plane and retains the initial object-to-pointer offset. Preview changes only model transforms and, for sliding openings, the host wall geometry. React commits the validated document once on release, preserving one undo entry and avoiding document rebuilds for every pointer move. Wall movement retains hosted opening offsets. Opening movement clamps along the host wall and rejects overlap; other entities retain dimensions and product metadata. Esc, lost capture, pointer cancellation, blur, hidden document, resize and editor context changes discard the preview.


## Object rotation

The engine owns a small DOM rotation dial projected at the selected object's center. It works with both renderers and hides for walkthroughs, inactive-floor selections, hosted openings and placement tools. Only the handle receives pointer input; the ring itself lets events pass through to normal selection/navigation.

An unmodified primary left press captures the handle's pointer, drains orbit damping and disconnects camera controls. Document capture listeners own the subsequent move/up events. RotationDial accumulates signed screen angles continuously across ±180°; points too close to the center are ignored. Encaixe snaps to 15°, while Shift bypasses snapping. Click/jitter preserves a pre-existing exact angle.

Rendering previews modify selected model transforms without changing the project. For a wall, updateEntity computes the preview positions and angles of its hosted openings. Release commits through onRotate once; Escape, pointer cancellation/capture loss, window blur, visibility loss, another pointer, resize, selection/document/view/tool changes and teardown restore the original document. The controls reconnect once ownership ends. Keyboard adjustments, the exact field and the 90° toolbar action reuse normal validated history and autosave. Hosted openings cannot rotate independently.


## Room circuits and switches

The optional `light` object stores power, finite intensity from 0 to 2, and a hex light color. Lights and switches can reference a room on their own floor through `roomId`; a switch can also reference its mounting wall through `switchWallId`. Schema validation rejects dangling or cross-floor references. Floor duplication remaps both references, wall transformations preserve switch offsets, and room/wall deletion removes dependent objects. Existing version-1 projects remain valid without these fields.

`installRoomLighting` adds missing ceiling fixtures and wall switches without mutating its input or duplicating existing items. Wall placement avoids door/window openings and faces the circuit's room. Fixture power is gated by the room circuit; fixture intensity multiplies circuit intensity, and an explicitly configured circuit color overrides fixture color. Rooms without explicit ceiling fixtures retain a virtual ceiling light.

`reachableSwitch` raycasts the actual meshes. Only a first-hit linked switch within 2.5 m can be activated, so other geometry blocks interaction. A primary click toggles only if the gesture never exceeds five pixels; dragging and returning to its origin still counts as navigation. E acts once per non-repeated keydown. Opening the lighting dialog pauses movement input. Changes that preserve `sameWalkGeometry` do not respawn or reorient the player.

Real mode builds lights for the player's physical floor, capped at 16 active sources. SVGRenderer ignores some material/light intensity properties and has no shadow occlusion: compatibility rendering therefore uses reduced point-light power, ambient color adjustment at night, and black emissive colors for disabled fixtures. It is an approximate preview; hardware lighting remains the preferred renderer.
