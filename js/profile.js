// Screen 1: capability profile.
// Each item has a status: 'yes', 'effort' (possible with effort), 'no', or null (not answered yet).
const Profile = (() => {
  const STORAGE_KEY = 'profile.v1';
  const GOOD_USABLE = 10; // suggested number of Yes / With effort items

  const GROUPS = [
    'Coffee and the farm',
    'Food and drink',
    'Hosting guests',
    'Getting here and around',
    'People and skills',
    'My additions',
  ];
  const CUSTOM_GROUP = 'My additions';

  const SEED = [
    ['coffee-picking', 'Coffee trees guests can pick from (in season)', 'Coffee and the farm'],
    ['hand-pulping', 'Pulping and washing cherries by hand', 'Coffee and the farm'],
    ['drying-yard', 'Drying yard or raised drying beds', 'Coffee and the farm'],
    ['hand-roaster', 'Hand roaster (pan or drum over fire)', 'Coffee and the farm'],
    ['grind-brew', 'Grinder and brewing gear for tastings', 'Coffee and the farm'],
    ['spice-plants', 'Pepper, cinnamon or cardamom growing on the farm', 'Coffee and the farm'],
    ['farm-walk', 'Walking path through the farm', 'Coffee and the farm'],
    ['beans-to-sell', 'Roasted coffee to sell to guests', 'Coffee and the farm'],

    ['outdoor-kitchen', 'Outdoor kitchen or cooking area', 'Food and drink'],
    ['rice-curry', 'Cook a rice and curry lunch for guests', 'Food and drink'],
    ['cooking-class', 'Let guests cook alongside me', 'Food and drink'],
    ['veg-meals', 'Vegetarian or vegan meals', 'Food and drink'],

    ['shade-seating', 'Shaded seating for a small group', 'Hosting guests'],
    ['rain-shelter', 'Covered space if it rains', 'Hosting guests'],
    ['guest-toilet', 'Clean toilet guests can use', 'Hosting guests'],
    ['overnight', 'Space for overnight guests', 'Hosting guests'],

    ['transport', 'Transport for guests (tuk-tuk or van)', 'Getting here and around'],
    ['station-pickup', 'Pick-up from the nearest train station or bus stop', 'Getting here and around'],
    ['parking', 'Parking for a car or van', 'Getting here and around'],

    ['english', 'Explain things to guests in English', 'People and skills'],
    ['helper', 'Family member or neighbour to help on visit days', 'People and skills'],
    ['phone-booking', 'Take bookings by phone or WhatsApp', 'People and skills'],
  ];

  let items = [];
  let els = {};

  function seedItems() {
    return SEED.map(([id, name, group]) => ({ id, name, group, status: null, custom: false }));
  }

  function load() {
    const data = Store.load(STORAGE_KEY);
    items = data && Array.isArray(data.items) ? data.items : seedItems();
  }

  function persist() {
    const ok = Store.save(STORAGE_KEY, { items });
    els.saveError.hidden = ok;
  }

  function render() {
    const answered = items.filter((i) => i.status).length;
    els.progress.textContent = `${answered} of ${items.length} answered`;

    // Encourage, never block: more Yes / With effort items give more options.
    const usable = items.filter((i) => i.status === 'yes' || i.status === 'effort').length;
    els.tip.textContent = usable >= GOOD_USABLE
      ? `${usable} items marked Yes or With effort. That gives the app plenty to work with.`
      : `You will get better results with at least ${GOOD_USABLE} items marked Yes or With effort. You have ${usable} so far.`;
    els.tip.classList.toggle('tip-done', usable >= GOOD_USABLE);

    const frag = document.createDocumentFragment();
    for (const group of GROUPS) {
      const groupItems = items.filter((i) => i.group === group);
      if (!groupItems.length) continue;
      const done = groupItems.filter((i) => i.status).length;
      const complete = done === groupItems.length;
      // A group starts folded only if everything in it is answered.
      if (!openGroups.has(group)) openGroups.set(group, !complete);

      const details = document.createElement('details');
      details.className = `group${complete ? ' group-done' : ''}`;
      details.dataset.group = group;
      details.open = openGroups.get(group);
      details.addEventListener('toggle', () => openGroups.set(group, details.open));

      const summary = document.createElement('summary');
      const name = document.createElement('span');
      name.className = 'group-name';
      name.textContent = group;
      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = complete ? '✓ All done' : `${done} of ${groupItems.length}`;
      count.setAttribute('aria-label', complete ? 'all answered' : `${done} of ${groupItems.length} answered`);
      summary.append(name, count);

      const ul = document.createElement('ul');
      ul.className = 'items';
      for (const item of groupItems) ul.appendChild(renderItem(item));
      details.append(summary, ul);
      frag.appendChild(details);
    }
    els.list.replaceChildren(frag);
  }

  // Which groups are open, kept across re-renders. Not saved: on the next
  // visit, finished groups start folded again.
  const openGroups = new Map();
  const FOLD_DELAY_MS = 450; // long enough to see the answer land before folding

  function isComplete(group) {
    return items.filter((i) => i.group === group).every((i) => i.status);
  }

  // Fold a group she has just finished and bring the next unfinished one into view.
  function foldFinished(group) {
    setTimeout(() => {
      if (!isComplete(group)) return; // she changed her mind in the meantime
      openGroups.set(group, false);
      render();
      const next = [...els.list.querySelectorAll('details.group')].find((d) => !d.classList.contains('group-done'));
      (next || els.list.querySelector(`details[data-group="${group}"]`))?.scrollIntoView({ block: 'start' });
    }, FOLD_DELAY_MS);
  }

  function renderItem(item) {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = item.id;

    const head = document.createElement('div');
    head.className = 'item-head';
    const name = document.createElement('div');
    name.className = 'item-name';
    name.id = `name-${item.id}`;
    name.textContent = item.name;
    head.appendChild(name);

    if (item.custom) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.dataset.action = 'remove';
      remove.textContent = 'Remove';
      head.appendChild(remove);
    }

    const choice = document.createElement('div');
    choice.className = 'choice';
    choice.setAttribute('role', 'group');
    choice.setAttribute('aria-labelledby', name.id);
    for (const [status, label] of [['yes', 'Yes'], ['effort', 'With effort'], ['no', 'No']]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.status = status;
      btn.setAttribute('aria-pressed', String(item.status === status));
      btn.textContent = label;
      choice.appendChild(btn);
    }

    li.append(head, choice);
    return li;
  }

  function onListClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const li = btn.closest('.item');
    const item = items.find((i) => i.id === li.dataset.id);
    if (!item) return;

    if (btn.dataset.action === 'remove') {
      if (!confirm(`Remove "${item.name}"?`)) return;
      items = items.filter((i) => i !== item);
    } else if (btn.dataset.status) {
      const wasComplete = isComplete(item.group);
      // Tapping the answer that is already chosen clears it (back to unanswered).
      item.status = item.status === btn.dataset.status ? null : btn.dataset.status;
      if (!wasComplete && isComplete(item.group)) foldFinished(item.group);
    } else {
      return;
    }
    persist();
    render();
  }

  function onAdd(e) {
    e.preventDefault();
    const name = els.addInput.value.trim();
    if (!name) {
      els.addInput.focus();
      return;
    }
    if (items.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
      alert('That is already on the list.');
      return;
    }
    const id = `custom-${Date.now().toString(36)}`;
    items.push({ id, name, group: CUSTOM_GROUP, status: null, custom: true });
    openGroups.set(CUSTOM_GROUP, true); // so she can answer the new item straight away
    els.addInput.value = '';
    persist();
    render();
    // Bring the new item into view so she can mark it straight away.
    document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function onReset() {
    if (!confirm('Clear all your answers and remove the items you added? The list goes back to how it started.')) return;
    items = seedItems();
    openGroups.clear();
    persist();
    render();
    window.scrollTo(0, 0);
  }

  function init() {
    els = {
      list: document.getElementById('cap-list'),
      progress: document.getElementById('progress'),
      tip: document.getElementById('usable-tip'),
      saveError: document.getElementById('save-error'),
      addForm: document.getElementById('add-form'),
      addInput: document.getElementById('add-input'),
      reset: document.getElementById('reset-btn'),
    };
    load();
    els.list.addEventListener('click', onListClick);
    els.addForm.addEventListener('submit', onAdd);
    els.reset.addEventListener('click', onReset);
    render();
  }

  // Read-only view for later screens (analysis and package building).
  function getItems() {
    return items.map((i) => ({ ...i }));
  }

  // Used by the package screen when she says she cannot do something.
  function setStatus(id, status) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.status = status;
    persist();
    render();
  }

  return { init, getItems, setStatus };
})();
