// Sentence embeddings via Transformers.js, run in a Web Worker (embed-worker.js).
// Only used to measure how similar two pieces of text are. Nothing here
// generates text.
const AI = (() => {
  const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  const BROWSER_CACHE = 'transformers-cache';

  let worker = null;
  let seq = 0;
  const pending = new Map();
  const vectors = new Map(); // text -> embedding, kept for this session
  let onProgress = () => {};

  function failAll(message) {
    for (const { reject } of pending.values()) reject(new Error(message));
    pending.clear();
    worker = null;
  }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker('js/embed-worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'download' || m.type === 'ready' || m.type === 'embedded') {
        onProgress(m);
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.type === 'result') p.resolve(m.vectors);
      else p.reject(new Error(m.message));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      failAll('The AI model could not start. Open the app through the local server, not as a file.');
    };
    return worker;
  }

  function request(texts) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, texts });
    });
  }

  // Returns one normalised vector per text, embedding only texts not seen before.
  async function embed(texts, progress) {
    const missing = [...new Set(texts.filter((t) => !vectors.has(t)))];
    if (missing.length) {
      onProgress = progress || (() => {});
      const result = await request(missing);
      missing.forEach((t, i) => vectors.set(t, result[i]));
    }
    return texts.map((t) => vectors.get(t));
  }

  // Vectors are normalised, so the dot product is the cosine similarity.
  function similarity(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // True if the model was already downloaded on this device.
  async function isModelCached() {
    try {
      if (!('caches' in self)) return false;
      const cache = await caches.open(BROWSER_CACHE);
      const keys = await cache.keys();
      return keys.some((r) => r.url.includes(MODEL_ID) && r.url.endsWith('.onnx'));
    } catch {
      return false;
    }
  }

  return { embed, similarity, isModelCached };
})();
