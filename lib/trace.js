const sharp = require('sharp');
const { resolveOptions } = require('./options');
const { rasterize } = require('./raster');
const { tracePixels } = require('./runner');

async function traceBuffer(buffer, body) {
  const resolved = resolveOptions(body);
  const image = await rasterize(buffer, resolved.maxSize);
  // Encode before the worker takes ownership of the pixel buffer.
  let raster = null;
  if (body && body.returnRaster) {
    const png = await sharp(Buffer.from(image.pixels), {
      raw: { width: image.width, height: image.height, channels: 4 },
    })
      .png()
      .toBuffer();
    raster = `data:image/png;base64,${png.toString('base64')}`;
  }

  const started = Date.now();
  const result = await tracePixels({
    width: image.width,
    height: image.height,
    pixels: image.pixels,
    options: resolved.tracer,
    corner: image.corner,
    knockout: resolved.knockout,
  });
  const stats = {
    ms: Date.now() - started,
    paths: result.paths,
    width: image.width,
    height: image.height,
    preset: resolved.preset,
  };
  return raster ? { svg: result.svg, stats, raster } : { svg: result.svg, stats };
}

module.exports = { traceBuffer };
