(function (root) {
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function formatBytes(size) {
    const n = Number(size) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function svgName(name, suffix) {
    const raw = String(name || 'image').replace(/\.[^.]+$/, '');
    const base = raw.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'image';
    return `${base}${suffix || ''}.svg`;
  }

  function isSvgFile(file) {
    if (!file) return false;
    return file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name || '');
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.readAsDataURL(blob);
    });
  }

  root.VertumnusUtil = { download, formatBytes, svgName, isSvgFile, blobToDataUrl };
})(window);
