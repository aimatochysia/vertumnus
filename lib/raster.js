const sharp = require('sharp');

function sampleCorner(pixels, width, height) {
  function at(x, y) {
    const i = (y * width + x) * 4;
    return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] };
  }
  const colors = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  let best = colors[0];
  let bestCount = -1;
  colors.forEach((color) => {
    const count = colors.filter((other) => {
      const dr = color.r - other.r;
      const dg = color.g - other.g;
      const db = color.b - other.b;
      const da = color.a - other.a;
      return dr * dr + dg * dg + db * db + da * da < 30 * 30;
    }).length;
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  });
  return best;
}

async function rasterize(buffer, maxSize) {
  try {
    const { data, info } = await sharp(buffer, {
      failOn: 'none',
      animated: false,
      pages: 1,
      limitInputPixels: 16 * 1024 * 1024,
    })
      .rotate()
      .resize({
        width: maxSize,
        height: maxSize,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (!info.width || !info.height || info.channels !== 4) {
      throw new Error('empty image');
    }
    const pixels = new Uint8ClampedArray(data);
    return {
      width: info.width,
      height: info.height,
      pixels,
      corner: sampleCorner(pixels, info.width, info.height),
    };
  } catch (err) {
    if (err && err.status) throw err;
    const error = new Error('Could not read that image. Use PNG, JPEG, WebP, GIF, AVIF, or TIFF.');
    error.status = 400;
    throw error;
  }
}

module.exports = { rasterize, sampleCorner };
