const DEFAULTS = {
  numberofcolors: 8,
  blurradius: 0,
  blurdelta: 20,
  pathomit: 8,
  ltres: 1,
  qtres: 1,
  rightangleenhance: true,
  linefilter: false,
  colorquantcycles: 3,
  colorsampling: 2,
  strokewidth: 1,
  knockout: false,
};

const PRESETS = [
  {
    id: 'poster',
    name: 'Poster',
    blurb: 'Flat inks, sturdy shapes.',
    options: {
      numberofcolors: 8,
      blurradius: 0,
      blurdelta: 20,
      pathomit: 16,
      ltres: 1,
      qtres: 1,
      rightangleenhance: true,
      linefilter: false,
      knockout: false,
    },
  },
  {
    id: 'logo',
    name: 'Logo',
    blurb: 'Crisp marks. Corner color dropped.',
    options: {
      numberofcolors: 6,
      blurradius: 0,
      blurdelta: 20,
      pathomit: 6,
      ltres: 0.7,
      qtres: 0.7,
      rightangleenhance: true,
      linefilter: false,
      colorquantcycles: 4,
      knockout: true,
    },
  },
  {
    id: 'stencil',
    name: 'Stencil',
    blurb: 'Two inks, high contrast.',
    options: {
      numberofcolors: 2,
      blurradius: 0,
      pathomit: 10,
      ltres: 1.2,
      qtres: 1.2,
      rightangleenhance: true,
      linefilter: false,
      knockout: true,
    },
  },
  {
    id: 'detail',
    name: 'Detail',
    blurb: 'More colors, tighter curves.',
    options: {
      numberofcolors: 24,
      blurradius: 0,
      pathomit: 2,
      ltres: 0.45,
      qtres: 0.45,
      rightangleenhance: false,
      linefilter: false,
      colorquantcycles: 4,
      knockout: false,
    },
  },
  {
    id: 'soft',
    name: 'Soft',
    blurb: 'Blurred edges, quieter specks.',
    options: {
      numberofcolors: 12,
      blurradius: 4,
      blurdelta: 64,
      pathomit: 16,
      ltres: 1.5,
      qtres: 1.3,
      rightangleenhance: false,
      linefilter: false,
      knockout: false,
    },
  },
  {
    id: 'line',
    name: 'Line',
    blurb: 'Strokes instead of filled shapes.',
    options: {
      numberofcolors: 4,
      blurradius: 0,
      pathomit: 8,
      ltres: 1,
      qtres: 0.8,
      rightangleenhance: true,
      linefilter: true,
      strokewidth: 1.25,
      knockout: false,
    },
  },
];

const CONTROLS = [
  { key: 'numberofcolors', label: 'Colors', min: 2, max: 48, step: 1 },
  { key: 'blurradius', label: 'Blur', min: 0, max: 5, step: 1, hint: 'Softens pixels before tracing. 0 is off.' },
  { key: 'pathomit', label: 'Drop specks', min: 0, max: 64, step: 1, hint: 'Drops paths shorter than this.' },
  { key: 'ltres', label: 'Line error', min: 0.1, max: 4, step: 0.1, hint: 'Lower stays closer to straight edges.' },
  { key: 'qtres', label: 'Curve error', min: 0.1, max: 4, step: 0.1, hint: 'Lower stays closer to bends.' },
  { key: 'maxSize', label: 'Trace size', min: 120, max: 800, step: 20, target: 'maxSize', hint: 'Longest edge, in pixels. Larger is slower and finer.' },
];

const TOGGLES = [
  { key: 'rightangleenhance', label: 'Right angles', hint: 'Square corners that are nearly 90°.' },
  { key: 'linefilter', label: 'Line art', hint: 'Draw strokes instead of filled shapes.' },
  { key: 'knockout', label: 'Knock out background', hint: 'Remove the color sitting in the corners.' },
];

const ADVANCED = [
  { key: 'colorquantcycles', label: 'Quant cycles', min: 1, max: 6, step: 1 },
  { key: 'colorsampling', label: 'Sampling', min: 0, max: 2, step: 1, hint: '0 generated, 1 random, 2 even.' },
  { key: 'blurdelta', label: 'Blur threshold', min: 0, max: 256, step: 1 },
  { key: 'strokewidth', label: 'Stroke width', min: 0, max: 6, step: 0.25 },
];

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function asBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function expandPreset(preset) {
  return {
    id: preset.id,
    name: preset.name,
    blurb: preset.blurb,
    options: { ...DEFAULTS, ...preset.options },
  };
}

function resolveOptions(body) {
  const input = body && typeof body === 'object' ? body : {};
  let preset = null;
  if (input.preset != null && input.preset !== '') {
    preset = PRESETS.find((item) => item.id === input.preset);
    if (!preset) {
      const error = new Error('Unknown preset');
      error.status = 400;
      throw error;
    }
  }

  const base = { ...DEFAULTS, ...(preset ? preset.options : {}) };
  const incoming = input.options && typeof input.options === 'object' ? input.options : {};
  const merged = { ...base, ...incoming };

  const tracer = {
    ltres: clampNumber(merged.ltres, 0.05, 8, DEFAULTS.ltres),
    qtres: clampNumber(merged.qtres, 0.05, 8, DEFAULTS.qtres),
    pathomit: clampInt(merged.pathomit, 0, 80, DEFAULTS.pathomit),
    numberofcolors: clampInt(merged.numberofcolors, 2, 48, DEFAULTS.numberofcolors),
    blurradius: clampInt(merged.blurradius, 0, 5, DEFAULTS.blurradius),
    blurdelta: clampInt(merged.blurdelta, 0, 256, DEFAULTS.blurdelta),
    colorquantcycles: clampInt(merged.colorquantcycles, 1, 6, DEFAULTS.colorquantcycles),
    colorsampling: clampInt(merged.colorsampling, 0, 2, DEFAULTS.colorsampling),
    strokewidth: clampNumber(merged.strokewidth, 0, 8, DEFAULTS.strokewidth),
    rightangleenhance: asBool(merged.rightangleenhance, DEFAULTS.rightangleenhance),
    linefilter: asBool(merged.linefilter, DEFAULTS.linefilter),
    viewbox: true,
    desc: false,
    scale: 1,
    roundcoords: 1,
    layering: 0,
    mincolorratio: 0,
    lcpr: 0,
    qcpr: 0,
    corsenabled: false,
  };

  return {
    preset: preset ? preset.id : null,
    tracer,
    knockout: asBool(merged.knockout, DEFAULTS.knockout),
    maxSize: clampInt(input.maxSize != null ? input.maxSize : 420, 64, 800, 420),
  };
}

function publicConfig() {
  return {
    defaultPreset: 'poster',
    defaultMaxSize: 420,
    presets: PRESETS.map(expandPreset),
    controls: CONTROLS,
    toggles: TOGGLES,
    advanced: ADVANCED,
  };
}

module.exports = {
  DEFAULTS,
  PRESETS,
  resolveOptions,
  publicConfig,
};
