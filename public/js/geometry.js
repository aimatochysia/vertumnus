(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VertumnusGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeRect(x0, y0, x1, y1) {
    return {
      left: Math.min(x0, x1),
      top: Math.min(y0, y1),
      right: Math.max(x0, x1),
      bottom: Math.max(y0, y1),
    };
  }

  // A shape counts only when its whole bounds sit inside the drag box.
  // Touching the edge counts. Crossing it does not.
  function fullyInside(inner, outer, eps) {
    const e = eps == null ? 0.75 : eps;
    return (
      inner.left >= outer.left - e &&
      inner.top >= outer.top - e &&
      inner.right <= outer.right + e &&
      inner.bottom <= outer.bottom + e
    );
  }

  return { normalizeRect, fullyInside };
});
