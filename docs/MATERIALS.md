# Material assets

The runtime assets are stored in `public/materials/` and listed in `manifest.json`. They are served by the app itself and require no external texture service or API key.

| Material | Prefix | Physical tile size | Maps |
|---|---|---|---|
| Oak | `oak` | 0.85 × 1.8 m | albedo, normal, roughness |
| Limestone | `limestone` | 1.2 × 1.2 m | albedo, normal, roughness |
| Linen | `linen` | 0.22 × 0.22 m | albedo, normal, roughness |
| Painted plaster | `plaster` | 0.65 × 0.65 m | albedo, normal, roughness |

Each map is a 512 × 512 JPEG named `<prefix>-<map>.jpg`. All twelve total about 795 KB. Albedo is sRGB; normal and roughness are linear data. Small edge blending reduces repetition seams.

## Provenance

The four albedo surfaces were generated with the built-in imagegen tool for this project as a borderless 2 × 2 architectural material atlas: oak boards (upper left), light limestone (upper right), beige linen weave (lower left), and off-white plaster (lower right), photographed orthographically with neutral diffuse lighting and no labels, furniture or perspective. The final atlas was cropped into four equal tiles and resized. Normal maps were estimated from luminance gradients; roughness maps were estimated from surface luminance variation and material-specific roughness ranges.

These are AI-generated textures and approximate PBR data, not photographed scans or physically measured material maps. Metal uses a deterministic brushed fallback texture and physical metallic parameters. Painted colors and editable finishes modulate the base textures.

## Runtime behavior

Loading failures retain deterministic fallback maps and show a partial-load message. Shared maps survive individual model disposal and are released when the engine is destroyed. Textures are applied to procedural models at metric scale; importing a product URL still supplies dimensions and provenance, rather than a manufacturer mesh.
