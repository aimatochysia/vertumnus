(function () {
  const SELECTABLE = 'path, rect, circle, ellipse, polygon, polyline, line, use';
  const SKIP = 'defs, clipPath, mask, pattern, symbol, marker';
  const WRAP = new Set(['g', 'a', 'svg', 'switch']);
  const NS = 'http://www.w3.org/2000/svg';

  const textarea = document.getElementById('svg-source');
  const fileInput = document.getElementById('svg-file');
  const sampleBtn = document.getElementById('load-sample');
  const nameEl = document.getElementById('source-name');
  const stage = document.getElementById('stage');
  const sheet = document.getElementById('sheet');
  const host = document.getElementById('svg-host');
  const overlay = document.getElementById('overlay');
  const marquee = document.getElementById('marquee');
  const empty = document.getElementById('stage-empty');
  const statusEl = document.getElementById('harvest-status');
  const downloadBtn = document.getElementById('harvest-download');
  const clearBtn = document.getElementById('harvest-clear');
  const zoomLabel = document.getElementById('zoom-label');
  const selectTool = document.getElementById('tool-select');
  const panTool = document.getElementById('tool-pan');
  const fitBtn = document.getElementById('fit-view');

  const geometry = window.VertumnusGeometry;
  let filename = 'selection.svg';
  let svgEl = null;
  let nodes = [];
  let nodeSet = new Set();
  let picked = new Set();
  let hot = null;
  let drag = null;
  let tool = 'select';
  let spaceDown = false;
  let timer = 0;
  let moveFrame = 0;
  let pendingMove = null;
  const pan = { x: 0, y: 0, scale: 1 };

  function visible() {
    const view = document.getElementById('view-harvest');
    return view && view.classList.contains('is-on');
  }

  function applyPan() {
    sheet.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`;
    zoomLabel.textContent = `${Math.round(pan.scale * 100)}%`;
  }

  function fit() {
    pan.x = 0;
    pan.y = 0;
    pan.scale = 1;
    applyPan();
    renderOverlays();
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = stage.getBoundingClientRect();
    const px = clientX - rect.left - stage.clientLeft;
    const py = clientY - rect.top - stage.clientTop;
    const next = Math.min(16, Math.max(0.2, pan.scale * factor));
    const k = next / pan.scale;
    pan.x = px - (px - pan.x) * k;
    pan.y = py - (py - pan.y) * k;
    pan.scale = next;
    applyPan();
    renderOverlays();
  }

  function setTool(next) {
    tool = next;
    selectTool.setAttribute('aria-pressed', tool === 'select' ? 'true' : 'false');
    panTool.setAttribute('aria-pressed', tool === 'pan' ? 'true' : 'false');
    stage.classList.toggle('is-pan', tool === 'pan' || spaceDown);
  }

  function boundsOf(el) {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }

  function renderOverlays() {
    overlay.replaceChildren();
    if (!svgEl) return;
    const origin = stage.getBoundingClientRect();
    nodes.forEach((el) => {
      const on = picked.has(el);
      if (!on && el !== hot) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      const box = document.createElement('div');
      box.className = on ? 'pick-box' : 'hot-box';
      box.style.left = `${rect.left - origin.left - stage.clientLeft}px`;
      box.style.top = `${rect.top - origin.top - stage.clientTop}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      overlay.appendChild(box);
    });
  }

  function updateStatus(text) {
    const count = picked.size;
    downloadBtn.disabled = count === 0 || !svgEl;
    clearBtn.disabled = count === 0;
    downloadBtn.textContent = count ? `Download SVG · ${count}` : 'Download SVG';
    if (text) {
      statusEl.textContent = text;
      return;
    }
    if (!svgEl) {
      statusEl.textContent = 'Paste or upload an SVG.';
      return;
    }
    if (count) {
      statusEl.textContent = `${count} selected of ${nodes.length}. Download keeps only these.`;
      return;
    }
    statusEl.textContent = `${nodes.length} paths and shapes. Drag a box around the ones you want.`;
  }

  function pathFromPoint(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (let i = 0; i < stack.length; i += 1) {
      const node = stack[i];
      if (!node.closest || node.closest('#overlay, #marquee, #stage-empty')) continue;
      const hit = node.closest(SELECTABLE);
      if (hit && nodeSet.has(hit)) return hit;
    }
    return null;
  }

  function collect(root) {
    const found = [];
    root.querySelectorAll(SELECTABLE).forEach((el) => {
      if (el.closest(SKIP)) return;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
      found.push(el);
    });
    return found;
  }

  function scrub(node) {
    if (!node || !node.querySelectorAll) return;
    if (node.removeAttribute) node.removeAttribute('data-harvest');
    node.querySelectorAll('[data-harvest]').forEach((el) => el.removeAttribute('data-harvest'));
  }

  function sanitize(svg) {
    const drop = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object', 'audio', 'video', 'link', 'meta']);
    svg.querySelectorAll('*').forEach((el) => {
      if (drop.has(el.localName)) el.remove();
    });
    svg.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'xlink:href' || name.endsWith(':href')) && value.startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
        if (name === 'style' && /javascript:|expression\s*\(/i.test(attr.value)) el.removeAttribute(attr.name);
      });
    });
  }

  function ensureViewBox(svg) {
    if (svg.getAttribute('viewBox')) return;
    const width = parseFloat(svg.getAttribute('width'));
    const height = parseFloat(svg.getAttribute('height'));
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      return;
    }
    stage.offsetWidth;
    try {
      const box = svg.getBBox();
      if (box.width > 0 || box.height > 0) {
        svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width || 1} ${box.height || 1}`);
      }
    } catch (err) {
      svg.setAttribute('viewBox', '0 0 100 100');
    }
  }

  function clearDrawing(message, warn) {
    svgEl = null;
    nodes = [];
    nodeSet = new Set();
    picked = new Set();
    hot = null;
    host.replaceChildren();
    overlay.replaceChildren();
    empty.hidden = false;
    empty.textContent = message;
    empty.classList.toggle('is-warn', !!warn);
    updateStatus();
  }

  function renderSource(options) {
    const text = textarea.value || '';
    if (!text.trim()) {
      clearDrawing('The drawing shows up here.', false);
      return;
    }
    let parsed;
    try {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('That text is not valid SVG.');
      parsed = doc.documentElement;
      if (!parsed || parsed.localName !== 'svg') throw new Error('The file needs an <svg> root.');
    } catch (err) {
      clearDrawing(err.message || 'Could not read that SVG.', true);
      return;
    }

    sanitize(parsed);
    parsed.setAttribute('preserveAspectRatio', parsed.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
    parsed.style.width = '100%';
    parsed.style.height = '100%';
    parsed.style.display = 'block';
    const live = document.importNode(parsed, true);
    host.replaceChildren(live);
    stage.offsetWidth;
    ensureViewBox(live);
    svgEl = live;
    nodes = collect(live);
    nodeSet = new Set(nodes);
    picked = new Set();
    hot = null;
    empty.hidden = true;
    empty.classList.remove('is-warn');
    if (options && options.resetView) fit();
    else renderOverlays();
    updateStatus();
  }

  function setText(text, name, resetView) {
    if (name) {
      filename = name;
      nameEl.textContent = name;
    }
    textarea.value = text;
    renderSource({ resetView: !!resetView });
  }

  async function loadFile(file) {
    if (!file) return;
    if (!window.VertumnusUtil.isSvgFile(file)) {
      if (window.VertumnusApp) window.VertumnusApp.show('trace');
      if (window.VertumnusTrace) window.VertumnusTrace.loadFile(file);
      return;
    }
    const text = await file.text();
    setText(text, file.name || 'upload.svg', true);
  }

  async function loadSample() {
    const response = await fetch('/samples/field.svg');
    if (!response.ok) throw new Error('Sample failed to load');
    const text = await response.text();
    setText(text, 'field.svg', true);
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  function boxInRoot(el, root) {
    try {
      const box = el.getBBox();
      const from = el.getScreenCTM();
      const to = root.getScreenCTM();
      if (!from || !to) return null;
      const into = to.inverse().multiply(from);
      const corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      corners.forEach(([x, y]) => {
        const point = new DOMPoint(x, y).matrixTransform(into);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      if (!Number.isFinite(minX)) return null;
      return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    } catch (err) {
      return null;
    }
  }

  function cloneChain(el, root) {
    let node = el.cloneNode(true);
    scrub(node);
    let parent = el.parentNode;
    while (parent && parent !== root) {
      if (parent.nodeType === 1 && WRAP.has(parent.localName)) {
        const wrap = parent.cloneNode(false);
        wrap.removeAttribute('id');
        scrub(wrap);
        wrap.appendChild(node);
        node = wrap;
      }
      parent = parent.parentNode;
    }
    return node;
  }

  function buildExportSvg(root, selected) {
    const out = document.createElementNS(NS, 'svg');
    out.setAttribute('xmlns', NS);
    out.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    ['fill', 'stroke', 'color', 'opacity', 'stroke-width', 'font-family'].forEach((name) => {
      if (root.hasAttribute(name)) out.setAttribute(name, root.getAttribute(name));
    });
    root.querySelectorAll('defs').forEach((defs) => out.appendChild(defs.cloneNode(true)));
    root.querySelectorAll('style').forEach((style) => {
      if (!style.closest('defs')) out.appendChild(style.cloneNode(true));
    });
    const layer = document.createElementNS(NS, 'g');
    selected.forEach((el) => layer.appendChild(cloneChain(el, root)));
    out.appendChild(layer);

    const boxes = selected.map((el) => boxInRoot(el, root)).filter(Boolean);
    if (!boxes.length) {
      out.setAttribute('viewBox', root.getAttribute('viewBox') || '0 0 100 100');
    } else {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      boxes.forEach((box) => {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      });
      const span = Math.max(maxX - minX, maxY - minY, 1);
      const pad = Math.max(1, span * 0.03);
      const x = round(minX - pad);
      const y = round(minY - pad);
      const w = round(Math.max(maxX - minX + pad * 2, 1));
      const h = round(Math.max(maxY - minY + pad * 2, 1));
      out.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      const scale = Math.max(w, h) < 64 ? 64 / Math.max(w, h) : 1;
      out.setAttribute('width', String(round(w * scale)));
      out.setAttribute('height', String(round(h * scale)));
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(out)}`;
  }

  function exportSvg() {
    if (!svgEl || !picked.size) return null;
    return buildExportSvg(svgEl, nodes.filter((el) => picked.has(el)));
  }

  function hideMarquee() {
    marquee.hidden = true;
  }

  function showMarquee(sel) {
    const origin = stage.getBoundingClientRect();
    marquee.hidden = false;
    marquee.style.left = `${sel.left - origin.left - stage.clientLeft}px`;
    marquee.style.top = `${sel.top - origin.top - stage.clientTop}px`;
    marquee.style.width = `${Math.max(0, sel.right - sel.left)}px`;
    marquee.style.height = `${Math.max(0, sel.bottom - sel.top)}px`;
  }

  function selectInside(sel, base) {
    const next = new Set(base);
    nodes.forEach((el) => {
      const box = boundsOf(el);
      if (geometry.fullyInside(box, sel)) next.add(el);
    });
    picked = next;
    renderOverlays();
    updateStatus(`${picked.size} fully inside`);
  }

  function paintMove(point) {
    if (!drag || drag.pointerId !== point.pointerId) return;
    if (drag.kind === 'pan') {
      pan.x = drag.panX + (point.clientX - drag.x);
      pan.y = drag.panY + (point.clientY - drag.y);
      applyPan();
      renderOverlays();
      return;
    }
    const dx = point.clientX - drag.x;
    const dy = point.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const sel = geometry.normalizeRect(drag.x, drag.y, point.clientX, point.clientY);
    showMarquee(sel);
    selectInside(sel, drag.base);
  }

  function queueMove(event) {
    pendingMove = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      if (pendingMove) paintMove(pendingMove);
    });
  }

  function flushMove(event) {
    if (moveFrame) {
      cancelAnimationFrame(moveFrame);
      moveFrame = 0;
    }
    paintMove({ clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId });
  }

  function hover(event) {
    if (!svgEl || drag) return;
    const hit = pathFromPoint(event.clientX, event.clientY);
    if (hit === hot) return;
    hot = hit;
    renderOverlays();
    if (hit && picked.size) updateStatus(`Hovering ${hit.localName}. ${picked.size} selected.`);
    else if (hit) updateStatus(`Hovering ${hit.localName}. Drag to keep what sits fully inside.`);
    else updateStatus();
  }

  function clearSelection() {
    picked = new Set();
    hot = null;
    hideMarquee();
    renderOverlays();
    updateStatus();
  }

  function cancelDrag() {
    if (!drag) return;
    if (drag.kind === 'select') picked = drag.before;
    drag = null;
    hideMarquee();
    renderOverlays();
    updateStatus();
  }

  function onPointerDown(event) {
    if (!visible()) return;
    if (event.button === 2) return;
    const panning = event.button === 1 || tool === 'pan' || spaceDown;
    if (!panning && event.button !== 0) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    if (panning) {
      drag = {
        kind: 'pan',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      stage.classList.add('is-panning');
      return;
    }
    drag = {
      kind: 'select',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      before: new Set(picked),
      base: event.shiftKey ? new Set(picked) : new Set(),
    };
  }

  function onPointerUp(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    flushMove(event);
    const finished = drag;
    drag = null;
    stage.classList.remove('is-panning');
    hideMarquee();
    if (finished.kind === 'pan') {
      renderOverlays();
      return;
    }
    if (!finished.moved) {
      const hit = pathFromPoint(event.clientX, event.clientY);
      if (event.shiftKey && hit) {
        if (picked.has(hit)) picked.delete(hit);
        else picked.add(hit);
      } else if (hit) {
        picked = new Set([hit]);
      } else if (!event.shiftKey) {
        picked = new Set();
      }
    }
    hot = pathFromPoint(event.clientX, event.clientY);
    renderOverlays();
    updateStatus();
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', (event) => {
    if (drag) queueMove(event);
    else hover(event);
  });
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', cancelDrag);
  stage.addEventListener('wheel', (event) => {
    if (!visible()) return;
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.08 : 1 / 1.08);
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (!visible()) return;
    const typing = event.target && event.target.closest && event.target.closest('textarea, input');
    if (event.code === 'Space' && !typing) {
      event.preventDefault();
      spaceDown = true;
      stage.classList.add('is-pan');
    }
    if (event.key === 'Escape') {
      cancelDrag();
      clearSelection();
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (event.key === '+' || event.key === '=') zoomAt(cx, cy, 1.1);
    if (event.key === '-' || event.key === '_') zoomAt(cx, cy, 1 / 1.1);
    if (event.key === 'f' || event.key === '0') fit();
  });
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') return;
    spaceDown = false;
    stage.classList.toggle('is-pan', tool === 'pan');
  });
  window.addEventListener('resize', () => {
    if (visible()) renderOverlays();
  });

  textarea.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => renderSource({ resetView: false }), 40);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) loadFile(file);
  });
  sampleBtn.addEventListener('click', () => {
    loadSample().catch((err) => clearDrawing(err.message, true));
  });
  downloadBtn.addEventListener('click', () => {
    const svg = exportSvg();
    if (!svg) return;
    const base = filename.replace(/\.svgz?$/i, '') || 'selection';
    window.VertumnusUtil.download(window.VertumnusUtil.svgName(base, '-selection'), svg);
  });
  clearBtn.addEventListener('click', clearSelection);
  selectTool.addEventListener('click', () => setTool('select'));
  panTool.addEventListener('click', () => setTool('pan'));
  fitBtn.addEventListener('click', fit);

  function relayout() {
    if (!svgEl) return;
    stage.offsetWidth;
    renderOverlays();
  }

  applyPan();
  updateStatus();

  window.VertumnusHarvest = { loadFile, setText, relayout, loadSample };
  window.__harvest = {
    setText: (text, name) => setText(text, name || 'test.svg', true),
    exportSvg,
    selectedCount: () => picked.size,
    selectableCount: () => nodes.length,
    relayout,
  };
})();
