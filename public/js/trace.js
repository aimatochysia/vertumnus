(function () {
  const presetList = document.getElementById('preset-list');
  const presetKicker = document.getElementById('preset-kicker');
  const sliderList = document.getElementById('slider-list');
  const toggleList = document.getElementById('toggle-list');
  const advancedList = document.getElementById('advanced-list');
  const statusEl = document.getElementById('trace-status');
  const downloadBtn = document.getElementById('trace-download');
  const stage = document.getElementById('trace-stage');
  const frames = document.getElementById('frames');
  const mount = document.getElementById('svg-mount');
  const sourceImg = document.getElementById('source-img');
  const empty = document.getElementById('trace-empty');
  const errorEl = document.getElementById('trace-error');
  const fileInput = document.getElementById('image-file');

  const state = { preset: null, maxSize: 420, options: {} };
  let spec = null;
  let specReady = null;
  let source = null;
  let raster = null;
  let lastSvg = '';
  let controller = null;
  let seq = 0;
  let timer = 0;

  function formatValue(control, value) {
    const step = Number(control.step);
    if (Number.isFinite(step) && step < 1) {
      const places = String(control.step).split('.')[1].length;
      return Number(value).toFixed(places);
    }
    return String(Math.round(Number(value)));
  }

  function showError(message) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function markPresets() {
    presetKicker.textContent = state.preset ? 'Presets' : 'Presets · custom';
    presetList.querySelectorAll('.preset').forEach((button) => {
      const on = button.dataset.preset === state.preset;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function syncControls() {
    sliderList.querySelectorAll('input[type="range"]').forEach((input) => writeRange(input));
    advancedList.querySelectorAll('input[type="range"]').forEach((input) => writeRange(input));
    toggleList.querySelectorAll('.toggle').forEach((button) => {
      const on = !!state.options[button.dataset.key];
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.querySelector('.toggle-state').textContent = on ? 'On' : 'Off';
    });
    markPresets();
  }

  function writeRange(input) {
    const target = input.dataset.target;
    const value = target === 'maxSize' ? state.maxSize : state.options[input.dataset.key];
    input.value = value;
    const output = input.parentElement.querySelector('output');
    if (output) output.textContent = formatValue({ step: input.step }, value);
  }

  function renderRanges(controls, container) {
    container.replaceChildren();
    controls.forEach((control) => {
      const label = document.createElement('label');
      label.className = 'slider';
      const top = document.createElement('span');
      top.className = 'slider-top';
      const name = document.createElement('span');
      name.textContent = control.label;
      const output = document.createElement('output');
      top.append(name, output);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = control.min;
      input.max = control.max;
      input.step = control.step;
      input.dataset.key = control.key;
      input.dataset.target = control.target || 'option';
      input.setAttribute('aria-label', control.label);
      input.addEventListener('input', () => {
        const numeric = Number(input.value);
        if (input.dataset.target === 'maxSize') state.maxSize = numeric;
        else state.options[control.key] = numeric;
        output.textContent = formatValue(control, numeric);
        state.preset = null;
        markPresets();
        scheduleTrace(false);
      });
      label.append(top, input);
      if (control.hint) {
        const hint = document.createElement('small');
        hint.textContent = control.hint;
        label.append(hint);
      }
      container.append(label);
    });
  }

  function renderToggles() {
    toggleList.replaceChildren();
    spec.toggles.forEach((toggle) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toggle';
      button.dataset.key = toggle.key;
      button.innerHTML = `<span class="toggle-name"></span><span class="toggle-state">Off</span>`;
      button.querySelector('.toggle-name').textContent = toggle.label;
      if (toggle.hint) button.title = toggle.hint;
      button.addEventListener('click', () => {
        state.options[toggle.key] = !state.options[toggle.key];
        state.preset = null;
        syncControls();
        scheduleTrace(true);
      });
      toggleList.append(button);
    });
  }

  function renderPresets() {
    presetList.replaceChildren();
    spec.presets.forEach((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset';
      button.dataset.preset = preset.id;
      button.innerHTML = '<strong></strong><small></small>';
      button.querySelector('strong').textContent = preset.name;
      button.querySelector('small').textContent = preset.blurb;
      button.addEventListener('click', () => applyPreset(preset, true));
      presetList.append(button);
    });
  }

  function applyPreset(preset, trace) {
    state.preset = preset.id;
    state.options = { ...preset.options };
    delete state.options.maxSize;
    syncControls();
    if (trace) scheduleTrace(true);
  }

  function mountSvg(svgText) {
    const cleaned = String(svgText).replace(/<\?xml[\s\S]*?\?>/g, '').trim();
    const doc = new DOMParser().parseFromString(cleaned, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg || svg.localName !== 'svg') throw new Error('Tracer returned an empty drawing');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Traced SVG');
    mount.replaceChildren(document.importNode(svg, true));
  }

  function setView(mode) {
    frames.dataset.mode = mode;
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.view === mode ? 'true' : 'false');
    });
  }

  async function rasterizeInBrowser(file, maxSize) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not rasterize'))), 'image/png');
      });
      const dataUrl = await window.VertumnusUtil.blobToDataUrl(blob);
      return {
        dataUrl,
        width,
        height,
        maxSize,
        naturalWidth: bitmap.width,
        naturalHeight: bitmap.height,
      };
    } finally {
      bitmap.close();
    }
  }

  async function ensureImage() {
    if (!source) return null;
    if (source.decodable) {
      if (!raster || raster.maxSize !== state.maxSize) {
        raster = await rasterizeInBrowser(source.file, state.maxSize);
        source.naturalWidth = raster.naturalWidth;
        source.naturalHeight = raster.naturalHeight;
        sourceImg.src = raster.dataUrl;
      }
      return { image: raster.dataUrl, askRaster: false };
    }
    if (!raster || raster.maxSize !== state.maxSize) {
      const image = await window.VertumnusUtil.blobToDataUrl(source.file);
      return { image, askRaster: true };
    }
    return { image: raster.dataUrl, askRaster: false };
  }

  function describe(paths, ms) {
    const bits = [];
    if (source && source.name) bits.push(source.name);
    if (source && source.naturalWidth) bits.push(`from ${source.naturalWidth}×${source.naturalHeight}`);
    if (raster && raster.width) bits.push(`traced ${raster.width}×${raster.height}`);
    bits.push(`${paths} paths`);
    if (ms != null) bits.push(`${ms} ms`);
    if (lastSvg) bits.push(window.VertumnusUtil.formatBytes(lastSvg.length));
    statusEl.textContent = bits.join(' · ');
  }

  function scheduleTrace(immediate) {
    window.clearTimeout(timer);
    if (!source) return;
    timer = window.setTimeout(runTrace, immediate ? 0 : 140);
  }

  async function runTrace() {
    if (!source) return;
    const ticket = ++seq;
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    stage.classList.add('is-busy');
    stage.setAttribute('aria-busy', 'true');
    statusEl.textContent = 'Tracing…';
    try {
      const prepared = await ensureImage();
      if (!prepared || ticket !== seq) return;
      const response = await fetch('/api/trace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          image: prepared.image,
          preset: state.preset,
          maxSize: state.maxSize,
          options: { ...state.options },
          returnRaster: prepared.askRaster,
        }),
        signal,
      });
      if (ticket !== seq) return;
      if (response.status === 409) return;
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Trace failed');
      }
      let paths;
      let ms;
      if (prepared.askRaster) {
        const data = await response.json();
        lastSvg = data.svg;
        raster = {
          dataUrl: data.raster,
          width: data.width,
          height: data.height,
          maxSize: state.maxSize,
        };
        sourceImg.src = data.raster;
        paths = data.paths;
        ms = data.ms;
      } else {
        lastSvg = await response.text();
        const width = Number(response.headers.get('x-width'));
        const height = Number(response.headers.get('x-height'));
        if (raster && width && height) {
          raster.width = width;
          raster.height = height;
        }
        paths = Number(response.headers.get('x-path-count'));
        ms = Number(response.headers.get('x-trace-ms'));
        if (!Number.isFinite(paths)) paths = (lastSvg.match(/<path\b/g) || []).length;
      }
      if (ticket !== seq) return;
      mountSvg(lastSvg);
      hideError();
      downloadBtn.disabled = false;
      empty.hidden = true;
      describe(paths, Number.isFinite(ms) ? ms : null);
      if (!paths) statusEl.textContent += ' · no paths, try fewer colors or less blur';
    } catch (err) {
      if (err.name === 'AbortError' || ticket !== seq) return;
      showError(err.message || 'Trace failed');
      statusEl.textContent = 'Trace failed';
    } finally {
      if (ticket === seq) {
        stage.classList.remove('is-busy');
        stage.setAttribute('aria-busy', 'false');
      }
    }
  }

  async function loadFile(file) {
    if (!file) return;
    await specReady;
    if (window.VertumnusUtil.isSvgFile(file)) {
      if (window.VertumnusApp) window.VertumnusApp.show('harvest');
      if (window.VertumnusHarvest) window.VertumnusHarvest.loadFile(file);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showError('That file is over 8MB. Export a PNG or JPEG under 8MB.');
      return;
    }
    source = { file, name: file.name || 'image' };
    raster = null;
    try {
      await createImageBitmap(file).then((bitmap) => {
        bitmap.close();
      });
      source.decodable = true;
    } catch (err) {
      source.decodable = false;
    }
    hideError();
    empty.hidden = true;
    statusEl.textContent = source.name;
    scheduleTrace(true);
  }

  async function loadDemo() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const g = canvas.getContext('2d');
    g.fillStyle = '#f3ecdf';
    g.fillRect(0, 0, 640, 420);
    g.fillStyle = '#e23d28';
    g.beginPath();
    g.arc(210, 180, 86, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c2420';
    g.fillRect(360, 110, 150, 190);
    g.fillStyle = '#f7f3ea';
    g.fillRect(392, 148, 86, 16);
    g.fillStyle = '#d2b072';
    g.beginPath();
    g.moveTo(36, 332);
    g.lineTo(150, 286);
    g.lineTo(250, 318);
    g.lineTo(360, 292);
    g.lineTo(360, 390);
    g.lineTo(36, 390);
    g.closePath();
    g.fill();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    await loadFile(new File([blob], 'demo.png', { type: 'image/png' }));
  }

  async function loadSpec() {
    const response = await fetch('/api/presets');
    if (!response.ok) throw new Error('Could not load presets');
    spec = await response.json();
    state.maxSize = spec.defaultMaxSize;
    renderPresets();
    renderRanges(spec.controls, sliderList);
    renderToggles();
    renderRanges(spec.advanced, advancedList);
    const starter = spec.presets.find((preset) => preset.id === spec.defaultPreset) || spec.presets[0];
    applyPreset(starter, false);
  }

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  document.querySelectorAll('.demo-image').forEach((button) => {
    button.addEventListener('click', () => {
      loadDemo().catch((err) => showError(err.message));
    });
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) loadFile(file).catch((err) => showError(err.message));
  });
  downloadBtn.addEventListener('click', () => {
    if (!lastSvg || !source) return;
    window.VertumnusUtil.download(window.VertumnusUtil.svgName(source.name), lastSvg);
  });

  specReady = loadSpec().catch((err) => {
    showError(err.message || 'Could not load presets');
    throw err;
  });

  window.VertumnusTrace = { loadFile, loadDemo };
  window.__trace = {
    loadFile,
    loadDemo,
    lastSvg: () => lastSvg,
  };
})();
