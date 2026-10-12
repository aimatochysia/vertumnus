# Vertumnus

Trace a raster image to SVG, then harvest the shapes that sit fully inside a drag box.

```bash
npm install
npm start
```

Open http://localhost:3000.

**Trace** accepts PNG, JPEG, WebP, GIF, AVIF, and TIFF. Presets and sliders retrace through `POST /api/trace`, so the preview follows the serverless converter.

**Harvest** takes a pasted or uploaded SVG on the left. The drawing on the right updates as the source changes. Drag a rectangle to keep only paths and basic shapes whose bounds are completely inside it, then download that selection as its own SVG.

```bash
curl -s -X POST http://localhost:3000/api/trace \
  -H 'content-type: application/json' \
  -d '{"image":"<base64 or data URL>","preset":"logo","maxSize":420}'
```

`preset` is one of `poster`, `logo`, `stencil`, `detail`, `soft`, `line`. A JSON `options` object overrides any of those values. `maxSize` is the longest edge used for tracing (64–800). Send `returnRaster: true` to get JSON `{ svg, raster, width, height, paths, ms }` instead of raw SVG.

`GET /api/presets` lists the presets and controls.
