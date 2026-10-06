# Roadmap

## v0.1 — Web prototype

Implemented: 3D/plan editing, metric geometry, hosted wall openings, apartments as groups, multiple floors, generated buildings, furniture/appliances, collision, stair walking, local JSON persistence, undo/redo.

## v0.2 — Houses and product placement

Implemented: house/terrain starters, outdoor landscaping catalog, open gate and pool collision, full-lot framing, proportional product preview, URL import endpoint, explicit dimension extraction, manual/copied specification fallback, and persisted source metadata.

## Next iteration

- Direct drag/move/rotate gizmos instead of relying on the numeric inspector.
- Wall endpoints, dimensions, snapping to other geometry and shared-wall merging.
- Room containment and apartment grouping with batch edits.
- Floor height and roof attachment that follow the actual wall geometry.
- Improved spawn placement, movement smoothing, camera positioning, and ceilings/head collision.

## Later

- Import manufacturer-provided GLB/glTF models and associate them with product URLs, then place assets with licensing metadata and asset loading progress.
- Floor materials, doors that open/close, balcony and facade components.
- Project thumbnails and reproducible scene visual regression tests.
- Cloud project persistence and authentication.
- IFC/DXF interoperability after the geometric/topological model is stable.
- Optional collaborative editing with document operations and conflict handling.

The order can change based on hands-on feedback from the first version.
