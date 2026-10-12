const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createServer, shutdown } = require('../server');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (err) {
  puppeteer = null;
}

const chrome = ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((candidate) => fs.existsSync(candidate));

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">
  <path id="a" fill="#e23d28" d="M10 20H70V80H10Z"/>
  <path id="b" fill="#1f6b4a" d="M120 20H180V80H120Z"/>
  <path id="c" fill="#d2b072" d="M230 20H290V80H230Z"/>
  <path id="ground" fill="#24362c" d="M0 100H300V112H0Z"/>
  <g transform="translate(120 20)">
    <path id="mark" fill="#111111" d="M24 24H36V36H24Z"/>
  </g>
</svg>`;

function viewBoxOf(svg) {
  const match = svg.match(/viewBox="([^"]+)"/);
  assert.ok(match, svg.slice(0, 180));
  return match[1].trim().split(/[\s,]+/).map(Number);
}

async function chooseFile(page, selector, filePath) {
  const input = await page.$(selector);
  await input.uploadFile(filePath);
  await input.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
}

async function drag(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 18 });
  await page.mouse.up();
}

async function boxes(page) {
  return page.evaluate(() => {
    function box(id) {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, right: rect.right, bottom: rect.bottom };
    }
    return { a: box('a'), b: box('b'), c: box('c'), ground: box('ground'), mark: box('mark') };
  });
}

test('trace and harvest work in the browser', { skip: !puppeteer || !chrome, timeout: 90000 }, async () => {
  fs.mkdirSync('/tmp/vertumnus', { recursive: true });
  const png = await sharp(Buffer.from(`
    <svg width="180" height="120" xmlns="http://www.w3.org/2000/svg">
      <rect width="180" height="120" fill="#f4efe4"/>
      <circle cx="70" cy="60" r="28" fill="#e23d28"/>
      <rect x="110" y="36" width="40" height="48" fill="#1c2420"/>
    </svg>`)).png().toBuffer();
  const imagePath = '/tmp/vertumnus/mark.png';
  fs.writeFileSync(imagePath, png);
  fs.writeFileSync('/tmp/vertumnus/fixture.svg', FIXTURE);

  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    const responses = [];
    page.on('response', (response) => {
      if (response.status() >= 500) responses.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-preset="poster"]');
    await page.evaluate(() => document.fonts.ready);

    const traced = page.waitForResponse((response) => response.url().includes('/api/trace') && response.status() === 200);
    await page.click('.preview-bar .demo-image');
    await traced;
    await page.waitForSelector('#svg-mount svg');
    const tracedBox = await page.$eval('#svg-mount svg', (el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.ok(tracedBox.width > 80 && tracedBox.height > 80, JSON.stringify(tracedBox));
    assert.equal(await page.$eval('#trace-download', (el) => el.disabled), false);
    assert.match(await page.$eval('#trace-status', (el) => el.textContent), /paths/);
    await page.screenshot({ path: '/tmp/vertumnus/trace-desktop.png' });

    await page.click('[data-view="split"]');
    const split = await page.evaluate(() => {
      const image = document.querySelector('#source-img').getBoundingClientRect();
      const svg = document.querySelector('#svg-mount svg').getBoundingClientRect();
      return { image: image.width, svg: svg.width };
    });
    assert.ok(split.image > 40 && split.svg > 40, JSON.stringify(split));
    await page.click('[data-view="svg"]');

    const recolor = page.waitForResponse((response) => response.url().includes('/api/trace') && response.status() === 200);
    await page.$eval('#slider-list input[data-key="numberofcolors"]', (el) => {
      el.value = '2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await recolor;
    await page.waitForFunction(() => {
      const status = document.getElementById('trace-status').textContent;
      return status.includes('paths') && !status.startsWith('Tracing');
    });
    assert.equal(
      await page.$eval('#slider-list input[data-key="numberofcolors"]', (el) => el.parentElement.querySelector('output').textContent),
      '2'
    );

    const upload = page.waitForResponse((response) => response.url().includes('/api/trace') && response.status() === 200);
    await chooseFile(page, '#image-file', imagePath);
    await upload;
    await page.waitForFunction(() => document.getElementById('trace-status').textContent.includes('mark'));

    await page.click('[data-preset="stencil"]');
    await page.waitForFunction(() => {
      const preset = document.querySelector('[data-preset="stencil"]').getAttribute('aria-pressed') === 'true';
      const knockout = document.querySelector('.toggle[data-key="knockout"]').getAttribute('aria-pressed') === 'true';
      const status = document.getElementById('trace-status').textContent;
      return preset && knockout && status.includes('paths') && !status.startsWith('Tracing');
    });

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.screenshot({ path: '/tmp/vertumnus/trace-mobile.png', fullPage: true });
    const mobileTrace = await page.$eval('#trace-stage', (el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.ok(mobileTrace.height > 140, JSON.stringify(mobileTrace));
    assert.ok(mobileTrace.width > 200, JSON.stringify(mobileTrace));

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.click('#tab-harvest');
    await page.evaluate((svg) => window.__harvest.setText(svg, 'fixture.svg'), FIXTURE);
    await page.waitForFunction(() => window.__harvest.selectableCount() === 5);
    const laidOut = await boxes(page);
    assert.ok(laidOut.a.w > 20 && laidOut.b.w > 20, JSON.stringify(laidOut));
    assert.ok(laidOut.a.right < laidOut.b.x - 8, 'shapes overlap; fixture did not fit');
    assert.ok(laidOut.b.right < laidOut.c.x - 8, 'shapes overlap; fixture did not fit');

    await page.mouse.move(laidOut.a.x + laidOut.a.w / 2, laidOut.a.y + laidOut.a.h / 2);
    await page.waitForSelector('.hot-box');

    const partial = await boxes(page);
    await drag(
      page,
      partial.b.x + partial.b.w * 0.3,
      partial.b.y - 8,
      partial.b.right - 2,
      partial.b.bottom + 6
    );
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 1, 'partial box should keep only the inner mark');
    let exported = await page.evaluate(() => window.__harvest.exportSvg());
    assert.match(exported, /id="mark"/);
    assert.doesNotMatch(exported, /id="b"/);
    assert.doesNotMatch(exported, /id="a"/);
    assert.doesNotMatch(exported, /id="ground"/);

    const full = await boxes(page);
    await drag(page, full.b.x - 8, full.b.y - 8, full.b.right + 8, full.b.bottom + 8);
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 2);
    exported = await page.evaluate(() => window.__harvest.exportSvg());
    assert.match(exported, /id="b"/);
    assert.match(exported, /id="mark"/);
    assert.match(exported, /translate\(120[\s,]20\)/);
    assert.doesNotMatch(exported, /id="a"/);
    assert.doesNotMatch(exported, /id="c"/);
    assert.doesNotMatch(exported, /id="ground"/);
    const viewBox = viewBoxOf(exported);
    assert.ok(viewBox[0] > 80 && viewBox[0] < 140, exported);
    assert.ok(viewBox[2] > 40 && viewBox[2] < 120, exported);
    await page.screenshot({ path: '/tmp/vertumnus/harvest-selected.png' });

    await page.evaluate(() => {
      window.__downloaded = null;
      const original = window.VertumnusUtil.download;
      window.VertumnusUtil.download = (name, text) => {
        window.__downloaded = { name, text };
        original(name, text);
      };
    });
    await page.click('#harvest-download');
    const downloaded = await page.evaluate(() => window.__downloaded);
    assert.equal(downloaded.name, 'fixture-selection.svg');
    assert.match(downloaded.text, /id="b"/);
    assert.doesNotMatch(downloaded.text, /id="ground"/);

    const shapes = await boxes(page);
    await drag(page, shapes.a.right + 6, shapes.a.bottom + 6, shapes.a.x - 6, shapes.a.y - 6);
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 1);
    exported = await page.evaluate(() => window.__harvest.exportSvg());
    assert.match(exported, /id="a"/);
    assert.doesNotMatch(exported, /id="b"/);

    await page.mouse.click(shapes.c.x + shapes.c.w / 2, shapes.c.y + shapes.c.h / 2);
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 1);
    assert.match(await page.evaluate(() => window.__harvest.exportSvg()), /id="c"/);

    await page.click('#harvest-clear');
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 0);
    assert.equal(await page.$eval('#harvest-download', (el) => el.disabled), true);

    await page.evaluate(() => {
      const stage = document.getElementById('stage');
      const rect = stage.getBoundingClientRect();
      stage.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -240,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
        cancelable: true,
      }));
    });
    assert.match(await page.$eval('#zoom-label', (el) => el.textContent), /10[1-9]%|1[1-9]\d%|[2-9]\d\d%/);
    const zoomed = await boxes(page);
    await drag(page, zoomed.c.x - 6, zoomed.c.y - 6, zoomed.c.right + 6, zoomed.c.bottom + 6);
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 1);
    exported = await page.evaluate(() => window.__harvest.exportSvg());
    assert.match(exported, /id="c"/);
    const zoomedBox = viewBoxOf(exported);
    assert.ok(zoomedBox[0] > 180 && zoomedBox[2] < 120, exported);

    await page.focus('#svg-source');
    await page.evaluate(() => {
      const field = document.getElementById('svg-source');
      field.setRangeText('#2244cc', field.value.indexOf('#e23d28'), field.value.indexOf('#e23d28') + 7, 'end');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById('svg-host').innerHTML.includes('#2244cc'));
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 0);

    await chooseFile(page, '#svg-file', path.join(process.cwd(), 'public/samples/field.svg'));
    await page.waitForFunction(() => window.__harvest.selectableCount() >= 8);
    await page.screenshot({ path: '/tmp/vertumnus/harvest-sample.png' });

    await page.evaluate(() => window.__harvest.setText('<nope>', 'bad.svg'));
    await page.waitForFunction(() => document.getElementById('stage-empty').classList.contains('is-warn'));

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate((svg) => window.__harvest.setText(svg, 'fixture.svg'), FIXTURE);
    await page.waitForFunction(() => window.__harvest.selectableCount() === 5);
    const mobileStage = await page.$eval('#stage', (el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top };
    });
    assert.ok(mobileStage.height > 180, JSON.stringify(mobileStage));
    const mobileShapes = await boxes(page);
    await drag(
      page,
      mobileShapes.a.x - 4,
      mobileShapes.a.y - 4,
      mobileShapes.a.right + 4,
      mobileShapes.a.bottom + 4
    );
    assert.equal(await page.evaluate(() => window.__harvest.selectedCount()), 1);
    await page.screenshot({ path: '/tmp/vertumnus/harvest-mobile.png', fullPage: true });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(responses, []);
  } finally {
    await browser.close();
    shutdown();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
