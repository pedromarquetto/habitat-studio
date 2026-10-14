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

Real mode builds lights for the player's physical floor, capped at 16 active sources. All active Real sources are shadowed spot lights. SVGRenderer has no shadow occlusion or textured PBR rendering, so Real is unavailable in that renderer. The ordinary editor and Caminhar remain available, with fixture emission showing circuit power.


## Precise switch mounting

The editor's pick carries the actual mesh intersection and clicked wall side separately from its floor-plane point. `switchMountPosition` constrains local wall offset, base height, facing angle and depth to the wall face, using half the fixture depth plus a 2 mm clearance. It supports either face and rotated walls. Openings are checked in both horizontal and vertical bounds; colliding placements are rejected without seeking another unrelated position. A mesh hit remains available even when the view ray does not intersect the floor plane.

Switch placement and its ghost share this helper. A mounted-switch drag intersects a vertical plane parallel to the wall, retaining the original pointer offset; plan view changes horizontal offset only. Gesture release commits one history entry, with optional Y. Numeric changes, face swapping and duplication preserve face mounting, and free rotation is disabled for mounted switches. Focusing uses the fixture's outward normal to show the correct face at close range. Moving a legacy displaced switch re-seats it on its wall without changing its circuit.


## Realistic rendering (v0.5)

`RealMaterials` upgrades the model's materials to MeshPhysicalMaterial. Color maps use sRGB; normal and roughness maps use linear data. Local 512 px JPEGs load once per surface into shared texture caches; materials are rebound as maps arrive. Until then, deterministic DataTextures are used. Object disposal removes live bindings without destroying shared maps. Engine disposal cancels late image attachment and disposes the library once. Geometry UVs project in metric units so the grain does not stretch with furniture dimensions. Hardware retains its own material; transparent glazing and emitters do not cast opaque shadows.

Real geometry uses rounded boxes on furniture and denser cylinders. Wall/roof dimensions stay exact. `roomCeiling` checks at least three room borders against same-floor walls and excludes open terraces and stair landings. Generated ceilings and opening-aware baseboards are presentation-only meshes.

`RealPipeline` composes the scene, GTAO contact shading, restrained bloom, ACES/color output and FXAA. Alta uses up to 1.5 pixel ratio; Leve uses up to 1 and disables GTAO/bloom. All lights cast shadows (up to 16 sources on the physical floor, nearest four at 1024 px in Alta, remaining at 512 px); sunlight uses 4096/2048 px maps. Walls and ceilings occlude those lights. Day/night procedural sky is cached as PMREM environment lighting. Alta captures a 128 px cubemap once per room/floor entry and after lighting/material changes for local reflections. These are approximate ambient reflections, not global illumination or path tracing.

Exposure and quality are presentation state only. Changes reconfigure lighting without changing saved data or visitor coordinates. Composer, shadow targets, reflection targets and cached environments are disposed during teardown. If postprocessing or reflection allocation throws, direct materials/shadows remain and an explanatory notification appears.

The UI blocks Real on the SVG path with an explicit WebGL requirement. Retry recreates only the viewport/engine, preserving the document, history and browser storage. Heavy rendering code remains dynamically imported by Viewport, and callback proxies use current React state.

## Suggested attachments (v0.6)

`placement.ts` is shared by green previews and committed placement. Picks carry the actual local-floor mesh height and transformed face normal as well as the floor-plane point. Generic wall fixtures use a 2 mm face clearance, full-width/height clamping, optional 5 cm snapping and opening/fixture overlap rejection. `wallMountId` fixes facing to the wall; numeric edits and wall-plane dragging reuse the same helper.

`supportId` and `supportRatio` retain the clicked horizontal furniture surface. Placement clamps the complete rotated footprint to that support. A dependency traversal in `updateEntity` propagates parent translation/rotation/height through nested stacks. Deletion cascades through dependencies; floor duplication remaps references and object duplication includes its descendants. `ceilingRoomId` derives light elevation from enclosing wall heights.

`fitRoof` selects same-floor walls whose centers lie in the drawn footprint, or the walls explicitly named by `roofWallIds`. It derives the axis-aligned rectangular bounds plus `roofOverhang` and seats the local roof base at the highest wall top. Attached roofs refit after wall edits and cannot be dragged away from their supports. Unequal wall heights can leave lower-wall gaps; complex roof contours, structural ridge planning and automatic wall leveling remain future work.

Legacy documents remain version 1: attachment fields are optional, so existing objects are not rewritten on load. Legacy roofs with no stored Y render using the inferred wall-top height. The inspector proposes an explicit updated attachment through ordinary validated history. Cutaway walls/doors retain transparent upper geometry for height context and wall-placement raycasts, while normal selection prefers opaque hits. Furniture normalization makes declared W/H/D and support elevations agree with actual model bounds.


## Geographic context (v0.7)

`Project.location` is optional and backward-compatible with version-1 documents. It holds latitude/longitude, clockwise heading from geographic north, a 250 m context radius, lot dimensions, base offset and visibility. Metric editor coordinates and entity/floor identities stay unchanged. Geographic points are converted to a local east/south tangent approximation, then rotated into the project frame; longitude wraps at the dateline. The JSON stores the anchor, not downloaded OSM geometry or map imagery.

`geographic-fetch.ts` sends a bounded Overpass query to fixed public endpoints, supports cancellation/timeouts, rejects responses over 8 MB, deduplicates non-cancellable requests and caches coordinate results for ten minutes (30-entry limit). The browser requests providers directly with its normal Referer/CORS. No credentials, arbitrary URL proxy, address-search service, API keys or paid integration are involved. Project edits do not requery unless location settings change; orientation/lot edits reuse coordinate results.

`GeographicScene` keeps derived geometry outside the editable project root/raycaster. Building ways and multipolygon outer/inner rings become extruded context volumes. Heights use explicit OSM height, then levels × 3 m, then a marked 9 m default (3 m garages); values are bounded. Intersecting buildings are suppressed in the simulated lot. Roads follow sampled terrain; mapped green/water areas have flat surface geometry. The data/display limits are disclosed, including the SVG budget of 80 nearest buildings and 100 ways.

Mapterhorn z12 512 px WebP Terrarium tiles are decoded via `createImageBitmap` and canvas, then bilinearly sampled in local coordinates. At most four tiles cover this neighborhood. A 40-segment terrain mesh (16 in SVG) uses heights relative to the anchor; the lot stays at zero with an 8 m smooth transition into the surrounding relief. Base offset raises/lowers the planned lot relative to the unmodified surroundings. Image and geometry resources are disposed, stale loads are aborted, and provider failures are independent.

The walking solver accepts optional ground/obstacle callbacks. Existing rooms/stairs still provide project support; the context supplies exterior heights and neighbor-footprint collision including courtyard holes, plus the 250 m boundary. Horizontal substeps prevent tunneling. On terrain arrival, ground-level feet settle to support; location changes during walking reset to the project spawn. The context is shared by editor/plan/walking/Real cameras, with visible OSM/Mapterhorn attribution and explicit estimated-height/flat-terrain states.

`LocationDialog` provides a limited interactive raster map, pointer drag/click and keyboard navigation/Enter selection, coordinate/full-link parsing and validated numeric controls. Only tiles intersecting the displayed viewport are requested; ordinary browser caching and origin Referer are retained. Latitude/longitude provide a fallback if map tiles fail. Choosing a location is explicit; no device geolocation permission is requested.
