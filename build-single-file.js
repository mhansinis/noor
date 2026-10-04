// Builds one self-contained HTML file of the app: dist/VestaFuture.html
// Usage: node build-single-file.js
//
// The stylesheet and every script are placed inside the page. The AI worker
// (js/embed-worker.js) is embedded as text and started from a Blob URL. The
// service worker is left out, since it needs to be a separate file.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'VestaFuture.html');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Stop a script from ending the <script> tag early.
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');

let html = read('index.html');

const css = read('style.css');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`);

const WORKER_LINE = "new Worker('js/embed-worker.js', { type: 'module' })";
const workerSrc = read('js/embed-worker.js');

html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (tag, file) => {
  let code = read(file);
  if (file === 'js/ai.js') {
    if (!code.includes(WORKER_LINE)) throw new Error('Worker line in js/ai.js has changed; update build-single-file.js');
    code = code.replace(
      WORKER_LINE,
      `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSrc)}], { type: 'text/javascript' })), { type: 'module' })`,
    );
  }
  if (file === 'js/app.js') {
    // No sw.js next to a single file.
    code = code.replace("navigator.serviceWorker.register('sw.js').catch(() => {});", '/* service worker not used in the single-file version */');
  }
  return `<script>\n${safe(code)}\n</script>`;
});

const leftover = html.match(/<script src=|<link rel="stylesheet"/);
if (leftover) throw new Error(`Something was not inlined: ${leftover[0]}`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Wrote ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
