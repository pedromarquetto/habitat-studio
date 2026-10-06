# Roadmap

## v0.1 — Web prototype

Implemented: 3D/plan editing, metric geometry, hosted wall openings, apartments as groups, multiple floors, generated buildings, furniture/appliances, collision, stair walking, local JSON persistence, undo/redo.

## v0.2 — Houses and product placement

Implemented: house/terrain starters, outdoor landscaping catalog, open gate and pool collision, full-lot framing, proportional product preview, URL import endpoint, explicit dimension extraction, manual/copied specification fallback, and persisted source metadata.

## v0.3 — Coverage and real-time exploration

Implemented: apartment/open-terrace penthouse generation, stair shaft and railings, flat roof slabs and pergolas, eight new appliances, eight woodwork items, above-floor object elevation, editable finishes and initial Real mode with PBR maps, day/night room lighting and first-person exploration. Hold-to-move and circular rotation handles are also implemented.

## Next iteration

- Improve product-specific visual detail and expand the modular woodwork catalog.
- Wall endpoints, dimensions, snapping to other geometry and shared-wall merging.
- Room containment and apartment grouping with batch edits.
- Floor height and roof attachment that follow the actual wall geometry.
- Improved spawn placement, movement smoothing, camera positioning, and ceilings/head collision.

## Later

- Import manufacturer-provided GLB/glTF models and associate them with product URLs, then place assets with licensing metadata and asset loading progress.
- Doors that open/close, balcony and facade components.
- Project thumbnails and reproducible scene visual regression tests.
- Cloud project persistence and authentication.
- IFC/DXF interoperability after the geometric/topological model is stable.
- Optional collaborative editing with document operations and conflict handling.

The order can change based on hands-on feedback from the first version.
