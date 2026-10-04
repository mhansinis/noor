// Screen 2: guest feedback.
// Each entry: { id, text, source: 'spoken' | 'written' | 'example', added: ISO date }.
const Feedback = (() => {
  const STORAGE_KEY = 'feedback.v1';
  const SOURCE_LABELS = { spoken: 'Spoken', written: 'Written', example: 'Example' };

  // Scripts the embedding model was not trained on. It groups these reviews by
  // language rather than meaning, so the analysis sets them aside.
  const UNREADABLE_SCRIPTS = [
    { name: 'Sinhala', re: /[඀-෿]/ },
    { name: 'Tamil', re: /[஀-௿]/ },
  ];

  function unreadableScript(text) {
    return UNREADABLE_SCRIPTS.find((s) => s.re.test(text))?.name || null;
  }

  let items = [];
  let els = {};
  let nextId = 0;

  function makeId() {
    return `fb-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
  }

  function load() {
    const data = Store.load(STORAGE_KEY);
    items = data && Array.isArray(data.items) ? data.items : [];
    // Feedback saved before personal details were removed gets cleaned once.
    let changed = false;
    items = items
      .map((i) => {
        const { text, removed } = Privacy.scrub(i.text);
        if (removed) changed = true;
        return removed ? { ...i, text } : i;
      })
      .filter((i) => !Privacy.isEmpty(i.text));
    if (changed) Store.save(STORAGE_KEY, { items });
  }

  function persist() {
    const ok = Store.save(STORAGE_KEY, { items });
    els.saveError.hidden = ok;
  }

  function add(rawTexts, source) {
    const added = new Date().toISOString();
    // Personal details are removed before anything is stored.
    const cleaned = rawTexts.map((t) => Privacy.scrub(t));
    const texts = cleaned.map((c) => c.text).filter((t) => !Privacy.isEmpty(t));
    const scrubbedCount = cleaned.filter((c) => c.removed).length;
    showPrivacyStatus(scrubbedCount, rawTexts.length - texts.length);

    // Newest first, keeping the order she entered them in.
    const fresh = texts.map((text) => ({ id: makeId(), text, source, added }));
    items = fresh.concat(items);
    persist();
    render();
    // If she just added something that will not be counted, make sure she sees why.
    const notCounted = texts.some(unreadableScript);
    if (notCounted) els.unreadable.scrollIntoView({ block: 'nearest' });
    return { notCounted, scrubbed: scrubbedCount };
  }

  function showPrivacyStatus(scrubbed, dropped) {
    const parts = [];
    if (scrubbed) parts.push(`Personal details removed from ${scrubbed} ${scrubbed === 1 ? 'comment' : 'comments'}.`);
    if (dropped) parts.push(`${dropped} ${dropped === 1 ? 'line was' : 'lines were'} only personal details, so not saved.`);
    els.privacyStatus.textContent = parts.join(' ');
    els.privacyStatus.hidden = parts.length === 0;
  }

  // ---- Paste box: split a messy paste, let her check it, then save ----

  // What the paste box would save, after splitting and removing personal
  // details. A line that is nothing but a sign-off ("Thanks, [name]") is left out.
  function detect(blob) {
    const { reviews, dropped } = PasteParser.parse(blob);
    const kept = []; // reviews to use for themes
    const short = []; // real reviews, but too short or vague to use for themes
    const scrubbed = new Set(); // texts that had personal details removed
    for (const r of reviews) {
      const { text, removed } = Privacy.scrub(r.text);
      if (removed) scrubbed.add(text);
      const words = text.replace(/\[(?:email|phone|name)\]/g, '').match(/\p{L}+/gu) || [];
      if (Privacy.isEmpty(text) || (words.length <= 1 && text !== r.text)) {
        dropped.push({ text: r.text, why: 'only a name or contact details' });
      } else if (Vague.isVague(text)) {
        short.push(text);
      } else {
        kept.push(text);
      }
    }
    return { kept, short, dropped, scrubbed };
  }

  // { kept, short, dropped } while she is checking a paste
  let preview = null;

  const SHOW_FIRST = 5;
  let showAll = false;

  // Text typed but not yet saved is kept on this phone, so a reload or a
  // closed tab does not lose it.
  const DRAFT_PASTE = 'draft.paste';
  const DRAFT_SPOKEN = 'draft.spoken';
  function saveDrafts() {
    Store.save(DRAFT_PASTE, els.pasteInput.value);
    Store.save(DRAFT_SPOKEN, els.spokenInput.value);
  }

  function updatePasteCount() {
    const hasText = /\S/.test(els.pasteInput.value);
    const found = hasText ? detect(els.pasteInput.value) : { kept: [], short: [] };
    const n = found.kept.length + found.short.length;
    els.pasteCount.textContent = hasText ? `${n} ${n === 1 ? 'review' : 'reviews'} found` : 'Nothing pasted yet';
    els.pasteSave.textContent = n ? `Check ${n} ${n === 1 ? 'review' : 'reviews'}` : 'Check reviews';
    els.pasteSave.disabled = !hasText;
  }

  function onPaste(e) {
    e.preventDefault();
    if (!/\S/.test(els.pasteInput.value)) return;
    preview = detect(els.pasteInput.value);
    els.pasteForm.hidden = true;
    els.preview.hidden = false;
    els.saveSummary.hidden = true;
    renderPreview();
    els.preview.scrollIntoView({ block: 'start' });
  }

  function previewItem(text, onRemove) {
    const li = document.createElement('li');
    li.className = 'pp-item';
    const p = document.createElement('p');
    p.className = 'pp-text';
    p.textContent = text;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-btn';
    remove.textContent = 'Remove';
    remove.addEventListener('click', onRemove);
    li.append(p, remove);
    return li;
  }

  function renderPreview() {
    const use = preview.kept.length;
    const short = preview.short.length;
    const n = use + short;
    els.previewTitle.textContent = n ? `Found ${n} ${n === 1 ? 'review' : 'reviews'}` : 'No reviews found';
    els.previewSave.textContent = n ? `Save ${n} ${n === 1 ? 'review' : 'reviews'}` : 'Save reviews';
    els.previewSave.disabled = n === 0;

    const removeFrom = (list, i) => () => {
      preview.dropped.unshift({ text: list[i], why: 'removed by you' });
      list.splice(i, 1);
      renderPreview();
    };
    els.previewList.replaceChildren(...preview.kept.map((t, i) => previewItem(t, removeFrom(preview.kept, i))));

    els.previewShort.hidden = short === 0;
    els.previewShortTitle.textContent = `Kept, but too short to use for themes: ${short}`;
    els.previewShortList.replaceChildren(...preview.short.map((t, i) => previewItem(t, removeFrom(preview.short, i))));

    const d = preview.dropped.length;
    els.previewDropped.hidden = d === 0;
    els.previewDroppedTitle.textContent = `Left out: ${d} ${d === 1 ? 'line' : 'lines'} (names, dates, ratings and website text)`;
    const left = document.createDocumentFragment();
    preview.dropped.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'pp-dropped-item';
      const p = document.createElement('p');
      p.className = 'pp-text';
      p.textContent = item.text;
      const why = document.createElement('span');
      why.className = 'pp-why';
      why.textContent = item.why;
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'pp-add-back';
      back.textContent = 'Add back';
      back.addEventListener('click', () => {
        const { text, removed } = Privacy.scrub(item.text);
        if (removed) preview.scrubbed.add(text);
        (Vague.isVague(text) ? preview.short : preview.kept).push(text);
        preview.dropped.splice(i, 1);
        renderPreview();
      });
      li.append(p, why, back);
      left.appendChild(li);
    });
    els.previewDroppedList.replaceChildren(left);
  }

  function closePreview() {
    preview = null;
    els.preview.hidden = true;
    els.pasteForm.hidden = false;
  }

  // Plain words for each reason a line was left out, grouped for the summary.
  const REASON_GROUPS = {
    'website text': ['website text', 'website text'],
    'name or place': ['a name or place', 'names or places'],
    'star rating': ['a rating', 'ratings'],
    rating: ['a rating', 'ratings'],
    date: ['a date', 'dates'],
    'owner reply': ['the owner’s reply', 'the owner’s reply'],
    'original of a translated review': ['the original of a translated review', 'the original of a translated review'],
    repeated: ['a repeat', 'repeats'],
    'shortened copy': ['a repeat', 'repeats'],
    'only a name or contact details': ['only a name or contact details', 'only a name or contact details'],
    'no words': ['no words', 'no words'],
    'removed by you': ['removed by you', 'removed by you'],
  };

  function renderSaveSummary(saved, shortCount, dropped, scrubbed) {
    const counts = new Map();
    for (const d of dropped) {
      const forms = REASON_GROUPS[d.why] || [d.why, d.why];
      const key = forms[1];
      const c = counts.get(key) || { forms, n: 0 };
      c.n += 1;
      counts.set(key, c);
    }
    const lines = [...counts.values()]
      .sort((a, b) => b.n - a.n)
      .map(({ forms, n }) => `${n} ${n === 1 ? 'line' : 'lines'} left out as ${n === 1 ? forms[0] : forms[1]}`);
    if (shortCount) lines.push(`${shortCount} ${shortCount === 1 ? 'review' : 'reviews'} kept but too short to use for themes`);
    if (scrubbed) lines.push(`Personal details removed from ${scrubbed} ${scrubbed === 1 ? 'review' : 'reviews'}`);

    const title = document.createElement('p');
    title.className = 'summary-title';
    title.textContent = `Saved ${saved} ${saved === 1 ? 'review' : 'reviews'}.`;
    const ul = document.createElement('ul');
    ul.className = 'summary-list';
    for (const l of lines) {
      const li = document.createElement('li');
      li.textContent = l;
      ul.appendChild(li);
    }
    els.saveSummary.replaceChildren(title, ...(lines.length ? [ul] : []));
    els.saveSummary.hidden = false;
  }

  function onPreviewSave() {
    if (!preview) return;
    const all = preview.kept.concat(preview.short);
    if (!all.length) return;
    const result = add(all, 'written');
    const notCounted = result.notCounted;
    const scrubbed = result.scrubbed + all.filter((t) => preview.scrubbed.has(t)).length;
    // The summary covers personal details too, so the one-line status is not needed.
    els.privacyStatus.hidden = true;
    renderSaveSummary(all.length, preview.short.length, preview.dropped, scrubbed);
    els.pasteInput.value = '';
    saveDrafts();
    closePreview();
    updatePasteCount();
    (notCounted ? els.unreadable : els.saveSummary).scrollIntoView({ block: 'start' });
  }

  function onPreviewCancel() {
    closePreview();
    els.pasteForm.scrollIntoView({ block: 'start' });
  }

  function render() {
    els.heading.textContent = items.length ? `Saved feedback (${items.length})` : 'Saved feedback';
    els.empty.hidden = items.length > 0;

    const hasExamples = items.some((i) => i.source === 'example');
    els.examples.hidden = hasExamples;
    els.clearExamples.hidden = !hasExamples;

    const frag = document.createDocumentFragment();
    // Newest few only, unless she asks for all, so Next stays within reach.
    const shown = showAll ? items : items.slice(0, SHOW_FIRST);
    for (const item of shown) {
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
      const tags = document.createElement('span');
      tags.className = 'fb-tags';
      tags.appendChild(tag);
      const lang = Language.guess(item.text);
      if (lang) {
        // Not translated (that needs a model the app does not have offline).
        const note = document.createElement('span');
        note.className = 'tag tag-lang';
        note.textContent = lang === 'Not in English' ? lang : `Appears to be ${lang}`;
        tags.appendChild(note);
      }
      if (Vague.isVague(item.text)) {
        const short = document.createElement('span');
        short.className = 'tag tag-short';
        short.textContent = 'Too short for themes';
        tags.appendChild(short);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.textContent = 'Remove';
      foot.append(tags, remove);

      li.append(text, foot);
      frag.appendChild(li);
    }
    els.list.replaceChildren(frag);
    const hiddenCount = items.length - SHOW_FIRST;
    els.more.hidden = hiddenCount <= 0;
    els.more.textContent = showAll ? 'Show fewer' : `Show all ${items.length} (${hiddenCount} more)`;
    renderUnreadable();
  }

  function renderUnreadable() {
    const notCounted = items.filter((i) => unreadableScript(i.text));
    els.unreadable.hidden = notCounted.length === 0;
    if (!notCounted.length) return;
    const n = notCounted.length;
    const langs = [...new Set(notCounted.map((i) => unreadableScript(i.text)))].join(' and ');
    const first = document.createElement('p');
    first.className = 'note-line';
    const strong = document.createElement('strong');
    strong.textContent = `${n} ${n === 1 ? 'review' : 'reviews'} in ${langs} ${n === 1 ? 'is' : 'are'} saved but not counted. `;
    first.append(strong, `The app groups ${langs} reviews by language rather than by meaning, so counting ${n === 1 ? 'it' : 'them'} would create a theme that is not real.`);
    const second = document.createElement('p');
    second.className = 'note-line';
    second.textContent = 'Instead, type a short English version of what the guest said in the “What did a guest say?” box above.';
    els.unreadable.replaceChildren(first, second);
  }

  function onSpoken(e) {
    e.preventDefault();
    const text = els.spokenInput.value.trim();
    if (!text) {
      els.spokenInput.focus();
      return;
    }
    els.saveSummary.hidden = true;
    add([text], 'spoken');
    els.spokenInput.value = '';
    saveDrafts();
    // Keep the keyboard up so she can add the next one straight away.
    els.spokenInput.focus({ preventScroll: true });
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
      unreadable: document.getElementById('fb-unreadable'),
      privacyStatus: document.getElementById('fb-privacy-status'),
      more: document.getElementById('fb-more'),
      preview: document.getElementById('paste-preview'),
      previewTitle: document.getElementById('pp-title'),
      previewList: document.getElementById('pp-list'),
      previewDropped: document.getElementById('pp-dropped'),
      previewDroppedTitle: document.getElementById('pp-dropped-title'),
      previewDroppedList: document.getElementById('pp-dropped-list'),
      previewSave: document.getElementById('pp-save'),
      previewCancel: document.getElementById('pp-cancel'),
      previewShort: document.getElementById('pp-short'),
      previewShortTitle: document.getElementById('pp-short-title'),
      previewShortList: document.getElementById('pp-short-list'),
      saveSummary: document.getElementById('fb-save-summary'),
    };
    load();
    els.spokenForm.addEventListener('submit', onSpoken);
    els.pasteForm.addEventListener('submit', onPaste);
    els.pasteInput.value = Store.load(DRAFT_PASTE) || '';
    els.spokenInput.value = Store.load(DRAFT_SPOKEN) || '';
    els.pasteInput.addEventListener('input', updatePasteCount);
    els.pasteInput.addEventListener('input', saveDrafts);
    els.spokenInput.addEventListener('input', saveDrafts);
    els.more.addEventListener('click', () => {
      showAll = !showAll;
      render();
      if (!showAll) els.heading.scrollIntoView({ block: 'start' });
    });
    els.previewSave.addEventListener('click', onPreviewSave);
    els.previewCancel.addEventListener('click', onPreviewCancel);
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

  return { init, getItems, unreadableScript };
})();
