const PATH_RE = /<path\b[\s\S]*?\/>/g;

function countPaths(svg) {
  const found = String(svg).match(/<path\b/g);
  return found ? found.length : 0;
}

function readFill(tag) {
  const fill = tag.match(/fill="rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)"/i);
  if (!fill) return null;
  const opacity = tag.match(/\sopacity="([\d.]+)"/i);
  return {
    r: Number(fill[1]),
    g: Number(fill[2]),
    b: Number(fill[3]),
    a: opacity ? Number(opacity[1]) : 1,
  };
}

function colorDist(corner, fill) {
  const dr = corner.r - fill.r;
  const dg = corner.g - fill.g;
  const db = corner.b - fill.b;
  const da = corner.a - fill.a * 255;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

function stripInvisible(svg) {
  return String(svg).replace(PATH_RE, (tag) => {
    const opacity = tag.match(/\sopacity="([\d.]+)"/i);
    if (opacity && Number(opacity[1]) === 0) return '';
    return tag;
  });
}

// Drop the palette color closest to the corner pixels. A path is removed only
// when that whole color is the background, so a shape that merely touches the
// corner color stays if it is a different ink.
function knockoutBackground(svg, corner) {
  const paths = String(svg).match(PATH_RE);
  if (!paths || !corner) return svg;

  const groups = new Map();
  paths.forEach((tag) => {
    const fill = readFill(tag);
    if (!fill) return;
    const key = [fill.r, fill.g, fill.b, fill.a].join(',');
    if (!groups.has(key)) groups.set(key, { fill, tags: [] });
    groups.get(key).tags.push(tag);
  });
  if (!groups.size) return svg;

  let nearest = null;
  let nearestDist = Infinity;
  const drop = [];
  groups.forEach((entry) => {
    const dist = colorDist(corner, entry.fill);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = entry;
    }
    if (dist <= 36) drop.push(entry);
  });
  if (!drop.length && nearest && nearestDist <= 84) drop.push(nearest);
  if (!drop.length) return svg;

  const dropping = new Set(drop.flatMap((entry) => entry.tags));
  if (dropping.size >= paths.length) return svg;

  return String(svg).replace(PATH_RE, (tag) => (dropping.has(tag) ? '' : tag));
}

function decorateSvg(svg, width, height) {
  let next = stripInvisible(svg).replace(/\sdesc="Created with imagetracer\.js version [^"]*"/, '');
  if (!/viewBox=/.test(next)) {
    next = next.replace('<svg ', `<svg viewBox="0 0 ${width} ${height}" `);
  }
  if (!/\swidth=/.test(next)) {
    next = next.replace('<svg ', `<svg width="${width}" height="${height}" `);
  }
  return next;
}

module.exports = {
  countPaths,
  stripInvisible,
  knockoutBackground,
  decorateSvg,
};
