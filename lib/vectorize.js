const ImageTracer = require('imagetracerjs');
const { knockoutBackground, decorateSvg, countPaths } = require('./knockout');

function vectorize(image, tracerOptions, corner, knockout) {
  if (!image || image.pixels.length !== image.width * image.height * 4) {
    const error = new Error('Unexpected image size');
    error.status = 400;
    throw error;
  }
  let svg = ImageTracer.imagedataToSVG(
    { width: image.width, height: image.height, data: image.pixels },
    tracerOptions
  );
  if (knockout) svg = knockoutBackground(svg, corner);
  svg = decorateSvg(svg, image.width, image.height);
  return { svg, paths: countPaths(svg) };
}

module.exports = { vectorize };
