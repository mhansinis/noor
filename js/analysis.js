// Screen 3: themes from guest feedback, and three package options ranked by cost.
//
// How it works:
// 1. Each review is embedded and compared with the example sentences of every
//    theme in themes.js. It joins the closest theme if similar enough.
// 2. Reviews that fit no known theme are clustered among themselves by
//    similarity. These clusters have no name, so they are shown but never used
//    to build a package.
// 3. Themes with at least MIN_SUPPORT reviews are matched to capabilities
//    marked Yes or With effort, using the fixed links in themes.js. Her own
//    added items match only if very close to what the theme needs.
// 4. Three options are assembled from the fixed step text of each matched
//    theme: no cost (Yes items only), low cost (exactly one With effort item),
//    higher investment (two or more). A tier that cannot be built says so.
//    No text is generated.
const Analysis = (() => {
  const MIN_SUPPORT = 3;
  const THEME_MATCH = 0.45; // review vs theme example sentence (below this it fits no theme)
  const CLUSTER_JOIN = 0.6; // unmatched review vs unmatched review
  const CUSTOM_CAP_MATCH = 0.8; // her own item vs what a theme needs
  const MAX_STEPS = 3;
  const TEST_VISITORS = 10;
  const TEST_KEEP = 3; // Fixed rule: keep the package if at least 3 of the next 10 take it.
  const STATUS_LABELS = { yes: 'Yes', effort: 'With effort' };

  // Scripts the model was not trained on. Its vectors for these are
  // meaningless (they all look alike), so these reviews are set aside.
  const UNREADABLE_SCRIPTS = [
    { name: 'Sinhala', re: /[඀-෿]/ },
    { name: 'Tamil', re: /[஀-௿]/ },
  ];

  const ACCEPTED_KEY = 'package.v1';

  let els = {};
  let running = false;
  let groups = null; // last analysis result
  let unreadable = [];
  let totalCount = 0;
  let readableCount = 0;
  let notice = '';

  // ---------- Step 1: themes ----------

  function unreadableScript(text) {
    return UNREADABLE_SCRIPTS.find((s) => s.re.test(text))?.name || null;
  }

  async function analyse() {
    const reviews = Feedback.getItems();
    unreadable = [];
    const readable = [];
    for (const r of reviews) {
      const script = unreadableScript(r.text);
      if (script) unreadable.push({ ...r, script });
      else readable.push(r);
    }
    totalCount = reviews.length;
    readableCount = readable.length;

    const anchorTexts = THEMES.flatMap((t) => t.anchors);
    const needTexts = THEMES.filter((t) => t.need).map((t) => t.need);
    const customCaps = Profile.getItems().filter((c) => c.custom).map((c) => c.name);
    const reviewTexts = readable.map((r) => r.text);
    await AI.embed([...anchorTexts, ...needTexts, ...customCaps, ...reviewTexts], showProgress);

    // All of these are now cached, so these calls return at once.
    const reviewVecs = await AI.embed(reviewTexts);
    const anchorVecs = new Map();
    for (const t of THEMES) anchorVecs.set(t.id, await AI.embed(t.anchors));

    const byTheme = new Map(THEMES.map((t) => [t.id, []]));
    const leftover = [];
    readable.forEach((r, i) => {
      let best = null;
      let bestScore = -1;
      for (const t of THEMES) {
        for (const a of anchorVecs.get(t.id)) {
          const s = AI.similarity(reviewVecs[i], a);
          if (s > bestScore) {
            bestScore = s;
            best = t;
          }
        }
      }
      if (bestScore >= THEME_MATCH) byTheme.get(best.id).push(r);
      else leftover.push({ review: r, vec: reviewVecs[i] });
    });

    const result = [];
    for (const t of THEMES) {
      const rs = byTheme.get(t.id);
      if (rs.length) result.push({ theme: t, reviews: rs });
    }
    for (const cluster of clusterLeftovers(leftover)) {
      result.push({ theme: null, reviews: cluster });
    }
    // Most supported first; ties keep catalogue order.
    result.sort((a, b) => b.reviews.length - a.reviews.length);
    return result;
  }

  // Average-linkage clustering: repeatedly merge the two closest clusters
  // while their average similarity is at least CLUSTER_JOIN.
  function clusterLeftovers(items) {
    let clusters = items.map((it) => [it]);
    const avg = (a, b) => {
      let s = 0;
      for (const x of a) for (const y of b) s += AI.similarity(x.vec, y.vec);
      return s / (a.length * b.length);
    };
    for (;;) {
      let bi = -1;
      let bj = -1;
      let best = CLUSTER_JOIN;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const s = avg(clusters[i], clusters[j]);
          if (s >= best) {
            best = s;
            bi = i;
            bj = j;
          }
        }
      }
      if (bi < 0) break;
      clusters[bi] = clusters[bi].concat(clusters[bj]);
      clusters.splice(bj, 1);
    }
    return clusters.map((c) => c.map((it) => it.review));
  }

  // ---------- Step 2: three options, ranked by cost ----------

  // Every word of a tier's wording is fixed here. Cost is stated as effort,
  // never as money.
  const TIERS = [
    {
      id: 'none',
      title: 'Option 1 · No cost',
      cost: 'Cost: uses what you already have.',
      cannot: () => 'No theme with enough feedback can be done using only things marked Yes.',
    },
    {
      id: 'low',
      title: 'Option 2 · Low cost',
      cost: 'Cost: needs a small purchase.',
      cannot: () => 'Nothing marked With effort matches a theme with enough feedback.',
    },
    {
      id: 'high',
      title: 'Option 3 · Higher investment',
      cost: 'Cost: needs an investment.',
      cannot: (n) => `This needs two or more different things marked With effort that match themes with enough feedback. You have ${n}.`,
    },
  ];

  // For one theme: the capability to use when only Yes counts, and the one to
  // use when a With effort item is allowed.
  async function capabilityOptions(theme, caps) {
    const linked = theme.caps.map((id) => caps.find((c) => c.id === id)).filter(Boolean);
    let yes = linked.find((c) => c.status === 'yes') || null;
    let effort = linked.find((c) => c.status === 'effort') || null;
    if (!yes || !effort) {
      const custom = await closestCustom(theme, caps);
      if (custom?.status === 'yes') yes ??= custom;
      if (custom?.status === 'effort') effort ??= custom;
    }
    return { yes, effort };
  }

  async function closestCustom(theme, caps) {
    const usable = (c) => c.status === 'yes' || c.status === 'effort';
    const custom = caps.filter((c) => c.custom && usable(c));
    if (!custom.length) return null;
    const [needVec] = await AI.embed([theme.need]);
    const customVecs = await AI.embed(custom.map((c) => c.name));
    let best = null;
    let bestScore = CUSTOM_CAP_MATCH;
    custom.forEach((c, i) => {
      const s = AI.similarity(needVec, customVecs[i]);
      if (s >= bestScore) {
        bestScore = s;
        best = c;
      }
    });
    return best;
  }

  async function propose() {
    const caps = Profile.getItems();
    const supported = groups.filter((g) => g.theme && g.reviews.length >= MIN_SUPPORT);
    const buildable = supported.filter((g) => g.theme.kind !== 'strength');

    // Steps she can do with a Yes item, and steps that need a With effort item
    // (only for themes no Yes item covers). Both lists are best supported first.
    const yesSteps = [];
    const effortSteps = [];
    const missing = [];
    for (const g of buildable) {
      const { yes, effort } = await capabilityOptions(g.theme, caps);
      const base = { theme: g.theme, count: g.reviews.length };
      if (yes) yesSteps.push({ ...base, cap: yes });
      else if (effort) effortSteps.push({ ...base, cap: effort });
      else missing.push({ ...base, linked: g.theme.caps.map((id) => caps.find((c) => c.id === id)).filter(Boolean) });
    }

    const distinctEffortCaps = new Set(effortSteps.map((s) => s.cap.id)).size;
    const options = TIERS.map((tier) => {
      let effortChosen;
      if (tier.id === 'none') effortChosen = [];
      else if (tier.id === 'low') effortChosen = effortSteps.slice(0, 1);
      else effortChosen = effortSteps.slice(0, MAX_STEPS);

      const effortUsed = new Set(effortChosen.map((s) => s.cap.id)).size;
      const ok =
        (tier.id === 'none' && yesSteps.length > 0) ||
        (tier.id === 'low' && effortUsed === 1) ||
        (tier.id === 'high' && effortUsed >= 2);
      if (!ok) return { tier, ok: false, reason: tier.cannot(distinctEffortCaps) };

      const chosen = effortChosen.concat(yesSteps.slice(0, MAX_STEPS - effortChosen.length));
      return makeOption(tier, chosen);
    });

    return { supported, buildable, missing, options, anyOk: options.some((o) => o.ok) };
  }

  function makeOption(tier, steps) {
    // Put in visit order (the order of THEMES).
    steps.sort((a, b) => THEMES.indexOf(a.theme) - THEMES.indexOf(b.theme));
    const caps = [];
    for (const s of steps) if (!caps.includes(s.cap)) caps.push(s.cap);
    return {
      tier,
      ok: true,
      name: `Coffee farm visit with ${joinWords(steps.map((s) => s.theme.title))}`,
      steps,
      reviewCount: steps.reduce((n, s) => n + s.count, 0),
      caps,
    };
  }

  function joinWords(words) {
    if (words.length < 2) return words.join('');
    return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  }

  // ---------- Rendering ----------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }

  function showProgress(m) {
    els.progress.hidden = false;
    if (m.type === 'download') {
      const mb = (b) => Math.round(b / 1e6);
      els.progressText.textContent = `Downloading the AI model: ${mb(m.loaded)} of ${mb(m.total)} MB. This happens only once.`;
      els.progressBar.value = m.total ? (m.loaded / m.total) * 100 : 0;
    } else if (m.type === 'ready') {
      els.progressText.textContent = 'Reading the reviews…';
      els.progressBar.removeAttribute('value');
    } else if (m.type === 'embedded') {
      els.progressText.textContent = `Reading the reviews: ${m.done} of ${m.total}`;
      els.progressBar.value = (m.done / m.total) * 100;
    }
  }

  function renderThemes() {
    const frag = document.createDocumentFragment();
    const tooSmallLeftovers = [];

    for (const g of groups) {
      if (!g.theme && g.reviews.length < MIN_SUPPORT) {
        tooSmallLeftovers.push(...g.reviews);
        continue;
      }
      frag.appendChild(renderTheme(g.theme ? g.theme.label : 'Similar comments, no name yet', g.reviews, g.theme));
    }
    if (tooSmallLeftovers.length) {
      frag.appendChild(renderTheme('Comments that fit no theme', tooSmallLeftovers, null, true));
    }
    if (!groups.length) frag.appendChild(el('p', 'muted', 'No readable feedback to group yet.'));
    els.themes.replaceChildren(frag);

    if (unreadable.length) {
      const scripts = [...new Set(unreadable.map((u) => u.script))].join(' and ');
      els.unreadable.hidden = false;
      const why = el('p', 'note-line');
      why.append(
        el('strong', null, `${plural(unreadable.length, 'review', 'reviews')} in ${scripts} ${unreadable.length === 1 ? 'is' : 'are'} kept but not counted. `),
        document.createTextNode(`The AI model groups ${scripts} reviews by language instead of by meaning, so counting them would create a false theme.`),
      );
      els.unreadable.replaceChildren(
        why,
        el('p', 'note-line', 'Instead, type a short English version of what the guest said into the “What did a guest say?” box on the Feedback screen.'),
        renderReviewList(unreadable),
      );
    } else {
      els.unreadable.hidden = true;
    }
  }

  function renderTheme(label, reviews, theme, forceSmall = false) {
    const enough = !forceSmall && reviews.length >= MIN_SUPPORT;
    const d = el('details', `theme${enough ? '' : ' theme-small'}`);
    const s = el('summary');
    s.appendChild(el('span', 'theme-label', label));
    let countText;
    if (!enough) countText = `Not enough feedback yet (${reviews.length})`;
    else if (!theme) countText = `${plural(reviews.length, 'review', 'reviews')} · cannot be used, no name`;
    else if (theme.kind === 'strength') countText = `${plural(reviews.length, 'review', 'reviews')} · guests like this`;
    else countText = plural(reviews.length, 'review', 'reviews');
    s.appendChild(el('span', 'theme-count', countText));
    d.append(s, renderReviewList(reviews));
    return d;
  }

  function renderReviewList(reviews) {
    const ul = el('ul', 'theme-reviews');
    for (const r of reviews) ul.appendChild(el('li', null, r.text));
    return ul;
  }

  function loadAccepted() {
    return Store.load(ACCEPTED_KEY);
  }

  function isAccepted(option) {
    const a = loadAccepted();
    return a && a.tier === option.tier.id && a.name === option.name && a.capIds?.join() === option.caps.map((c) => c.id).join();
  }

  function renderPackage(result) {
    const frag = document.createDocumentFragment();
    if (notice) frag.appendChild(el('p', 'pkg-notice', notice));

    if (!result.anyOk) {
      const box = el('div', 'pkg pkg-none');
      box.appendChild(el('p', 'pkg-kicker', 'No package yet'));
      box.appendChild(el('h2', null, 'A package cannot be built from what you have now.'));
      const ul = el('ul', 'pkg-missing');
      for (const reason of whyNoPackage(result)) ul.appendChild(el('li', null, reason));
      box.appendChild(ul);
      frag.appendChild(box);
      els.pkg.replaceChildren(frag);
      return;
    }

    frag.appendChild(el('p', 'muted small', 'Three options, cheapest first. Each one is built only from what guests said and what your farm can do.'));
    for (const option of result.options) frag.appendChild(renderOption(option));

    if (result.missing.length) {
      frag.appendChild(el('p', 'pkg-also',
        `Guests also asked about: ${result.missing.map((m) => `${m.theme.label} (${m.count})`).join('; ')}. ` +
        'Nothing marked Yes or With effort on your farm covers this yet.'));
    }
    els.pkg.replaceChildren(frag);
  }

  function renderOption(option) {
    const box = el('div', 'pkg');
    box.appendChild(el('p', 'pkg-kicker', option.tier.title));

    if (!option.ok) {
      box.classList.add('pkg-none');
      box.appendChild(el('p', 'pkg-cannot', `Cannot be built: ${option.reason}`));
      return box;
    }

    box.appendChild(el('h2', null, option.name));
    box.appendChild(el('p', 'pkg-cost', option.tier.cost));

    const ol = el('ol', 'pkg-steps');
    for (const s of option.steps) {
      const li = el('li');
      li.appendChild(el('p', 'pkg-step', s.theme.step));
      const trace = el('p', 'pkg-trace');
      trace.append(
        el('span', null, `Because: ${plural(s.count, 'review', 'reviews')}, “${s.theme.label}”`),
        el('br'),
        el('span', null, `Uses: ${s.cap.name} (${STATUS_LABELS[s.cap.status]})`),
      );
      li.appendChild(trace);
      ol.appendChild(li);
    }
    box.appendChild(ol);

    box.appendChild(el('p', 'pkg-evidence',
      `Evidence: ${plural(option.reviewCount, 'review supports', 'reviews support')} this. ` +
      `Uses: ${option.caps.map((c) => `${c.name} (${STATUS_LABELS[c.status]})`).join('; ')}.`));
    box.appendChild(el('p', 'pkg-test',
      `Test: offer it to your next ${TEST_VISITORS} visitors. Keep it if at least ${TEST_KEEP} of them take it.`));

    const accepted = isAccepted(option);
    if (accepted) {
      const when = new Date(loadAccepted().acceptedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      box.appendChild(el('p', 'pkg-accepted', `You said you can do this (${when}). Now try it with your next ${TEST_VISITORS} visitors.`));
    }

    const actions = el('div', 'pkg-actions');
    const yes = el('button', 'btn btn-primary', 'I can do this');
    yes.type = 'button';
    yes.hidden = accepted;
    yes.addEventListener('click', () => onAccept(option));
    const no = el('button', 'btn btn-secondary', 'I cannot');
    no.type = 'button';
    no.addEventListener('click', () => onCannot(option, box, actions));
    actions.append(yes, no);
    box.appendChild(actions);
    return box;
  }

  function whyNoPackage(pkg) {
    const reasons = [];
    if (!totalCount) {
      reasons.push('There is no guest feedback yet. Add some on the Feedback screen.');
      return reasons;
    }
    if (!readableCount) {
      reasons.push('None of the saved feedback is in a language the AI model can read.');
      return reasons;
    }
    if (!pkg.supported.length) {
      reasons.push(`No theme has ${MIN_SUPPORT} or more reviews yet. Collect more guest feedback.`);
      const best = groups.find((g) => g.theme);
      if (best) reasons.push(`Closest so far: “${best.theme.label}” with ${plural(best.reviews.length, 'review', 'reviews')}.`);
      return reasons;
    }
    if (!pkg.buildable.length) {
      reasons.push(`Guests mostly praised things you already do (${pkg.supported.map((g) => g.theme.label).join('; ')}). No request or problem has ${MIN_SUPPORT} or more reviews yet.`);
      return reasons;
    }
    for (const m of pkg.missing) {
      const head = `Guests: “${m.theme.label}” (${plural(m.count, 'review', 'reviews')}).`;
      if (m.linked.length) {
        const states = m.linked.map((c) => `“${c.name}” (now ${c.status === 'no' ? 'No' : 'not answered'})`);
        const joined = states.length > 1 ? `${states.slice(0, -1).join(', ')} or ${states[states.length - 1]}` : states[0];
        reasons.push(`${head} Missing: ${joined}. It must be Yes or With effort on the My farm screen.`);
      } else {
        reasons.push(`${head} Nothing on your farm list covers this. It needs: ${m.theme.need.toLowerCase()}.`);
      }
    }
    return reasons;
  }

  // ---------- Actions ----------

  // Only one option is kept as accepted; choosing another replaces it.
  async function onAccept(option) {
    Store.save(ACCEPTED_KEY, {
      tier: option.tier.id,
      name: option.name,
      steps: option.steps.map((s) => s.theme.step),
      capIds: option.caps.map((c) => c.id),
      reviewCount: option.reviewCount,
      acceptedAt: new Date().toISOString(),
    });
    notice = '';
    renderPackage(await propose());
  }

  function onCannot(option, box, actions) {
    if (option.caps.length === 1) {
      markCannot(option.caps[0]);
      return;
    }
    // Several capabilities: ask which one.
    const ask = el('div', 'pkg-which');
    ask.appendChild(el('p', null, 'Which one can you not do?'));
    for (const c of option.caps) {
      const b = el('button', 'btn btn-secondary btn-wide', c.name);
      b.type = 'button';
      b.addEventListener('click', () => markCannot(c));
      ask.appendChild(b);
    }
    const cancel = el('button', 'btn btn-quiet', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      ask.remove();
      actions.hidden = false;
    });
    ask.appendChild(cancel);
    actions.hidden = true;
    box.appendChild(ask);
    ask.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function markCannot(cap) {
    Profile.setStatus(cap.id, 'no');
    notice = `“${cap.name}” is now marked No on your farm list.`;
    renderPackage(await propose());
    els.pkg.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Flow ----------

  async function run() {
    if (running) return;
    running = true;
    notice = '';
    els.error.hidden = true;
    els.start.hidden = true;
    els.progress.hidden = false;
    els.progressText.textContent = 'Starting the AI model…';
    els.progressBar.removeAttribute('value');
    try {
      groups = await analyse();
      renderThemes();
      renderPackage(await propose());
      els.result.hidden = false;
      // Ask the browser not to clear the downloaded model when space is low.
      navigator.storage?.persist?.().catch(() => {});
    } catch (err) {
      els.error.textContent = `Something went wrong: ${err.message}`;
      els.error.hidden = false;
      els.start.hidden = false;
    } finally {
      els.progress.hidden = true;
      running = false;
    }
  }

  async function onShow() {
    if (running) return;
    // Download only when she asks for it; after that, analyse straight away.
    if (await AI.isModelCached()) {
      run();
    } else {
      els.start.hidden = false;
      els.result.hidden = true;
    }
  }

  function init() {
    els = {
      start: document.getElementById('an-start'),
      run: document.getElementById('an-run'),
      offlineNote: document.getElementById('an-offline-note'),
      progress: document.getElementById('an-progress'),
      progressText: document.getElementById('an-progress-text'),
      progressBar: document.getElementById('an-progress-bar'),
      error: document.getElementById('an-error'),
      result: document.getElementById('an-result'),
      pkg: document.getElementById('an-package'),
      themes: document.getElementById('an-themes'),
      unreadable: document.getElementById('an-unreadable'),
      rerun: document.getElementById('an-rerun'),
    };
    els.run.addEventListener('click', run);
    els.rerun.addEventListener('click', run);
    // Without a secure context the browser cannot keep the model, so it would
    // download again every time.
    els.offlineNote.hidden = window.isSecureContext;
  }

  return { init, onShow };
})();
