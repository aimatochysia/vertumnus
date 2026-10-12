(function () {
  const tabs = {
    trace: document.getElementById('tab-trace'),
    harvest: document.getElementById('tab-harvest'),
  };
  const views = {
    trace: document.getElementById('view-trace'),
    harvest: document.getElementById('view-harvest'),
  };
  const note = document.getElementById('top-note');
  let current = 'trace';

  function show(name) {
    current = name === 'harvest' ? 'harvest' : 'trace';
    Object.keys(views).forEach((key) => {
      const on = key === current;
      views[key].classList.toggle('is-on', on);
      tabs[key].setAttribute('aria-selected', on ? 'true' : 'false');
    });
    note.textContent = current === 'trace'
      ? 'Image to SVG, live'
      : 'Only shapes fully inside the box';
    if (current === 'harvest' && window.VertumnusHarvest) window.VertumnusHarvest.relayout();
  }

  function isFileDrag(event) {
    return event.dataTransfer && [...event.dataTransfer.types].includes('Files');
  }

  tabs.trace.addEventListener('click', () => show('trace'));
  tabs.harvest.addEventListener('click', () => show('harvest'));

  document.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    document.body.classList.add('is-filedrag');
  });
  document.addEventListener('dragend', () => document.body.classList.remove('is-filedrag'));
  document.addEventListener('drop', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    document.body.classList.remove('is-filedrag');
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    if (window.VertumnusUtil.isSvgFile(file)) {
      show('harvest');
      window.VertumnusHarvest.loadFile(file);
    } else {
      show('trace');
      window.VertumnusTrace.loadFile(file);
    }
  });

  document.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    if (!data) return;
    const typing = event.target && event.target.closest && event.target.closest('textarea, input');
    const imageItem = [...data.items].find((item) => item.type && item.type.startsWith('image/') && item.type !== 'image/svg+xml');
    const text = data.getData('text/plain');

    if (imageItem && !typing) {
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      show('trace');
      window.VertumnusTrace.loadFile(file);
      return;
    }
    if (text && /<svg[\s>]/i.test(text) && !(typing && current === 'harvest')) {
      event.preventDefault();
      show('harvest');
      window.VertumnusHarvest.setText(text, 'pasted.svg', true);
    }
  });

  window.VertumnusApp = { show };
})();
