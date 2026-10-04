// Screen 2: guest feedback.
// Each entry: { id, text, source: 'spoken' | 'written' | 'example', added: ISO date }.
const Feedback = (() => {
  const STORAGE_KEY = 'feedback.v1';
  const SOURCE_LABELS = { spoken: 'Spoken', written: 'Written', example: 'Example' };

  let items = [];
  let els = {};
  let nextId = 0;

  function makeId() {
    return `fb-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
  }

  function load() {
    const data = Store.load(STORAGE_KEY);
    items = data && Array.isArray(data.items) ? data.items : [];
  }

  function persist() {
    const ok = Store.save(STORAGE_KEY, { items });
    els.saveError.hidden = ok;
  }

  function add(texts, source) {
    const added = new Date().toISOString();
    // Newest first, keeping the order she entered them in.
    const fresh = texts.map((text) => ({ id: makeId(), text, source, added }));
    items = fresh.concat(items);
    persist();
    render();
  }

  // Non-empty lines from the paste box.
  function pastedLines() {
    return els.pasteInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function updatePasteCount() {
    const n = pastedLines().length;
    els.pasteCount.textContent = `${n} ${n === 1 ? 'review' : 'reviews'} in the box`;
    els.pasteSave.textContent = n ? `Save ${n} ${n === 1 ? 'review' : 'reviews'}` : 'Save reviews';
    els.pasteSave.disabled = n === 0;
  }

  function render() {
    els.heading.textContent = items.length ? `Saved feedback (${items.length})` : 'Saved feedback';
    els.empty.hidden = items.length > 0;

    const hasExamples = items.some((i) => i.source === 'example');
    els.examples.hidden = hasExamples;
    els.clearExamples.hidden = !hasExamples;

    const frag = document.createDocumentFragment();
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'fb-item';
      li.dataset.id = item.id;

      const text = document.createElement('p');
      text.className = 'fb-text';
      text.textContent = item.text;

      const foot = document.createElement('div');
      foot.className = 'fb-foot';
      const tag = document.createElement('span');
      tag.className = `tag tag-${item.source}`;
      tag.textContent = SOURCE_LABELS[item.source] || item.source;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.textContent = 'Remove';
      foot.append(tag, remove);

      li.append(text, foot);
      frag.appendChild(li);
    }
    els.list.replaceChildren(frag);
  }

  function onSpoken(e) {
    e.preventDefault();
    const text = els.spokenInput.value.trim();
    if (!text) {
      els.spokenInput.focus();
      return;
    }
    add([text], 'spoken');
    els.spokenInput.value = '';
    // Keep the keyboard up so she can add the next one straight away.
    els.spokenInput.focus();
  }

  function onPaste(e) {
    e.preventDefault();
    const lines = pastedLines();
    if (!lines.length) return;
    add(lines, 'written');
    els.pasteInput.value = '';
    updatePasteCount();
    els.heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onListClick(e) {
    const btn = e.target.closest('.remove-btn');
    if (!btn) return;
    const id = btn.closest('.fb-item').dataset.id;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const preview = item.text.length > 60 ? `${item.text.slice(0, 60)}…` : item.text;
    if (!confirm(`Remove this feedback?\n\n"${preview}"`)) return;
    items = items.filter((i) => i !== item);
    persist();
    render();
  }

  function onLoadExamples() {
    // Added after her own feedback so it is clear which is which.
    const added = new Date().toISOString();
    const examples = EXAMPLE_REVIEWS.map((text) => ({ id: makeId(), text, source: 'example', added }));
    items = items.concat(examples);
    persist();
    render();
  }

  function onClearExamples() {
    if (!confirm('Remove all example reviews? Your own feedback stays.')) return;
    items = items.filter((i) => i.source !== 'example');
    persist();
    render();
  }

  function init() {
    els = {
      saveError: document.getElementById('fb-save-error'),
      spokenForm: document.getElementById('spoken-form'),
      spokenInput: document.getElementById('spoken-input'),
      pasteForm: document.getElementById('paste-form'),
      pasteInput: document.getElementById('paste-input'),
      pasteCount: document.getElementById('paste-count'),
      pasteSave: document.getElementById('paste-save'),
      heading: document.getElementById('fb-heading'),
      empty: document.getElementById('fb-empty'),
      list: document.getElementById('fb-list'),
      examples: document.getElementById('fb-examples'),
      clearExamples: document.getElementById('fb-clear-examples'),
    };
    load();
    els.spokenForm.addEventListener('submit', onSpoken);
    els.pasteForm.addEventListener('submit', onPaste);
    els.pasteInput.addEventListener('input', updatePasteCount);
    els.list.addEventListener('click', onListClick);
    els.examples.addEventListener('click', onLoadExamples);
    els.clearExamples.addEventListener('click', onClearExamples);
    updatePasteCount();
    render();
  }

  // Read-only view for the analysis screen.
  function getItems() {
    return items.map((i) => ({ ...i }));
  }

  return { init, getItems };
})();
