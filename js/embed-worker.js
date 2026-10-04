// Runs the sentence embedding model off the main thread so the page stays
// responsive on a slow phone. Transformers.js stores the model and its WASM
// runtime in the browser cache after the first download; the service worker
// (sw.js) caches this library file, so later runs need no network.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BATCH = 8;

env.allowLocalModels = false;

let extractorPromise = null;

function getExtractor() {
  extractorPromise ??= pipeline('feature-extraction', MODEL, {
    dtype: 'q8', // 118 MB quantized model
    device: 'wasm',
    progress_callback: (p) => {
      if (p.status === 'progress_total') {
        postMessage({ type: 'download', loaded: p.loaded, total: p.total });
      }
    },
  });
  return extractorPromise;
}

self.onmessage = async (e) => {
  const { id, texts } = e.data;
  try {
    const extractor = await getExtractor();
    postMessage({ type: 'ready' });
    const vectors = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const out = await extractor(texts.slice(i, i + BATCH), { pooling: 'mean', normalize: true });
      vectors.push(...out.tolist());
      postMessage({ type: 'embedded', id, done: Math.min(i + BATCH, texts.length), total: texts.length });
    }
    postMessage({ type: 'result', id, vectors });
  } catch (err) {
    // Allow a retry after a failed download.
    extractorPromise = null;
    postMessage({ type: 'error', id, message: String(err?.message || err) });
  }
};
