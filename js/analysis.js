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
//
// Example reviews are counted like any other, but every count that includes
// them says how many are examples.
const Analysis = (() => {
  const MIN_SUPPORT = 3;
  const NEAR_MISS = 2; // themes up to this many reviews short are named as "closest"
  const THEME_MATCH = 0.45; // review vs theme example sentence (below this it fits no theme)
  const CLUSTER_JOIN = 0.6; // unmatched review vs unmatched review
  const CUSTOM_CAP_MATCH = 0.8; // her own item vs what a theme needs
  const MAX_STEPS = 3;
  const TEST_VISITORS = 10;
  const TEST_KEEP = 3; // Fixed rule: keep the package if at least 3 of the next 10 take it.
  const STATUS_LABELS = { yes: 'Yes', effort: 'With effort', no: 'No' };
  const statusLabel = (s) => STATUS_LABELS[s] || 'not answered';

  const ACCEPTED_KEY = 'package.v1';

  let els = {};
  let running = false;
  let groups = null; // last analysis result
  let totalCount = 0;
  let readableCount = 0;
  let tooShort = []; // real reviews too vague to use for themes ("Amazing!")
  // Message shown above the options, e.g. after "I cannot". `undo` holds the
  // change that can be reversed: { id, name, prev }.
  let notice = null;

  // ---------- Step 1: themes ----------

  async function analyse() {
    const reviews = Feedback.getItems();
    const countable = reviews.filter((r) => !Feedback.unreadableScript(r.text));
    tooShort = countable.filter((r) => Vague.isVague(r.text));
    const readable = countable.filter((r) => !Vague.isVague(r.text));
    totalCount = reviews.length;
    readableCount = readable.length;

    // Theme sentences first, quietly; then her reviews, with a count she can follow.
    const anchorTexts = THEMES.flatMap((t) => t.anchors);
    const needTexts = THEMES.filter((t) => t.need).map((t) => t.need);
    const customCaps = Profile.getItems().filter((c) => c.custom).map((c) => c.name);
    await AI.embed([...anchorTexts, ...needTexts, ...customCaps], showSetupProgress);
    const reviewTexts = readable.map((r) => r.text);
    const reviewVecs = await AI.embed(reviewTexts, showProgress);

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
    { id: 'none', title: 'Option 1 · No cost', cost: 'Cost: uses what you already have.' },
    { id: 'low', title: 'Option 2 · Low cost', cost: 'Cost: needs something you can arrange.' },
    { id: 'high', title: 'Option 3 · Higher investment', cost: 'Cost: needs an investment.' },
  ];

  // What a tier that cannot be built would need, naming specific farm items
  // or themes that are short of reviews. Never returns an empty list.
  function tierNeeds(tier, ctx) {
    const { caps, effortSteps, missing, distinctEffortCaps } = ctx;
    const linkedOf = (theme) => theme.caps.map((id) => caps.find((c) => c.id === id)).filter(Boolean);
    const capRef = (c) => `“${c.name}” (now ${statusLabel(c.status)})`;
    const orList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0]);
    const about = (s) => `“${s.theme.label}” (${reviewCount(s.reviews)})`;
    const short = groups
      .filter((g) => g.theme && g.theme.kind !== 'strength' && g.reviews.length < MIN_SUPPORT)
      .map((g) => ({ theme: g.theme, reviews: g.reviews, more: MIN_SUPPORT - g.reviews.length, linked: linkedOf(g.theme) }));
    const shortLine = (s, mark) => {
      const head = `${about(s)} needs ${plural(s.more, 'more review', 'more reviews')}`;
      const have = s.linked.find((c) => c.status === mark);
      if (have) return `${head}. You already have “${have.name}” (${statusLabel(mark)}).`;
      if (s.linked.length) return `${head}, and ${orList(s.linked.map(capRef))} marked ${statusLabel(mark)}.`;
      return `${head}, and something on your farm list that covers it (${s.theme.need.toLowerCase()}).`;
    };
    const markLine = (s, mark) => {
      const linked = linkedOf(s.theme).filter((c) => c.status !== 'yes' && c.status !== mark);
      if (linked.length) return `Mark ${orList(linked.map(capRef))} as ${statusLabel(mark)}, for ${about(s)}.`;
      return `Add something to your farm list for ${about(s)} and mark it ${statusLabel(mark)}. It needs: ${s.theme.need.toLowerCase()}.`;
    };
    const needs = [];

    if (tier.id === 'none') {
      for (const s of effortSteps.concat(missing).slice(0, 2)) needs.push(markLine(s, 'yes'));
      if (!needs.length) for (const s of short.slice(0, 2)) needs.push(shortLine(s, 'yes'));
    } else if (tier.id === 'low') {
      for (const s of missing.slice(0, 2)) needs.push(markLine(s, 'effort'));
      if (!needs.length) {
        for (const s of short.filter((x) => !x.linked.some((c) => c.status === 'yes')).slice(0, 2)) {
          needs.push(shortLine(s, 'effort'));
        }
      }
      if (!needs.length) {
        needs.push('Everything guests asked for often enough is already covered by things marked Yes (see Option 1). ' +
          'A low-cost option needs another thing guests ask for that you could do with effort.');
      }
    } else {
      const used = [...new Map(effortSteps.map((s) => [s.cap.id, s.cap])).values()];
      needs.push(`Two different things marked With effort that guests asked for. You have ${used.length}` +
        `${used.length ? `: ${used.map((c) => `“${c.name}”`).join(', ')}` : ''}.`);
      const usedIds = new Set(used.map((c) => c.id));
      const extra = missing.filter((s) => !linkedOf(s.theme).some((c) => usedIds.has(c.id)));
      for (const s of extra.slice(0, 2 - distinctEffortCaps)) needs.push(markLine(s, 'effort'));
      if (needs.length === 1) {
        const candidates = short.filter((x) => !x.linked.some((c) => c.status === 'yes' || usedIds.has(c.id)));
        for (const s of candidates.slice(0, 2)) needs.push(shortLine(s, 'effort'));
      }
    }

    if (!needs.length || (tier.id === 'high' && needs.length === 1)) {
      needs.push(`More guest feedback: at least ${MIN_SUPPORT} guests need to mention the same thing. Add what guests say on the Feedback screen.`);
    }
    return needs;
  }

  // For one theme: the capability to use when only Yes counts, and the one to
  // use when a With effort item is allowed.
  async function capabilityOptions(theme, caps) {
    const linked = theme.caps.map((id) => caps.find((c) => c.id === id)).filter(Boolean);
    let yes = linked.find((c) => c.status === 'yes') || null;
    let effort = linked.find((c) => c.status === 'effort') || null;
    if (!yes || !effort) {
      const custom = await closestCustom(theme, caps, (c) => c.status === 'yes' || c.status === 'effort');
      if (custom?.status === 'yes') yes ??= custom;
      if (custom?.status === 'effort') effort ??= custom;
    }
    // Unanswered means unknown, not No: never used to build, but remembered so
    // she can be asked about it.
    const unknown =
      linked.find((c) => !c.status) || (await closestCustom(theme, caps, (c) => !c.status));
    return { yes, effort, unknown };
  }

  async function closestCustom(theme, caps, include) {
    const custom = caps.filter((c) => c.custom && include(c));
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
      const { yes, effort, unknown } = await capabilityOptions(g.theme, caps);
      const base = { theme: g.theme, reviews: g.reviews, unknown };
      if (yes) yesSteps.push({ ...base, cap: yes });
      else if (effort) effortSteps.push({ ...base, cap: effort });
      else missing.push({ ...base, linked: g.theme.caps.map((id) => caps.find((c) => c.id === id)).filter(Boolean) });
    }

    // Themes a review or two short of MIN_SUPPORT that her farm could already
    // deliver: named when nothing can be built, so she knows what to collect.
    const near = [];
    for (const g of groups) {
      const short = MIN_SUPPORT - g.reviews.length;
      if (!g.theme || g.theme.kind === 'strength' || short < 1 || short > NEAR_MISS) continue;
      const { yes, effort } = await capabilityOptions(g.theme, caps);
      if (yes || effort) near.push({ theme: g.theme, reviews: g.reviews, cap: yes || effort, short });
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
      if (!ok) {
        const ask = unansweredBlockers(tier, effortSteps, missing, distinctEffortCaps);
        const needs = tierNeeds(tier, { caps, effortSteps, missing, distinctEffortCaps });
        return { tier, ok: false, needs, ask };
      }

      const chosen = effortChosen.concat(yesSteps.slice(0, MAX_STEPS - effortChosen.length));
      return makeOption(tier, chosen);
    });

    return { supported, buildable, missing, near, options, anyOk: options.some((o) => o.ok) };
  }

  // Unanswered items that are all that stand between a tier and being built.
  // Each entry: { cap, theme, reviews, answer } where `answer` is the status
  // that would build the tier ('yes' for no cost, 'effort' otherwise).
  function unansweredBlockers(tier, effortSteps, missing, distinctEffortCaps) {
    const asks = [];
    const seen = new Set();
    const add = (s, answer) => {
      if (!s.unknown || seen.has(s.unknown.id)) return;
      seen.add(s.unknown.id);
      asks.push({ cap: s.unknown, theme: s.theme, reviews: s.reviews, answer });
    };
    if (tier.id === 'none') {
      // A Yes for any of these themes would build Option 1.
      for (const s of effortSteps.concat(missing)) add(s, 'yes');
    } else if (tier.id === 'low') {
      for (const s of missing) add(s, 'effort');
    } else {
      const effortIds = new Set(effortSteps.map((s) => s.cap.id));
      for (const s of missing) if (s.unknown && !effortIds.has(s.unknown.id)) add(s, 'effort');
      // Only ask if answering them could actually reach two With effort items.
      if (distinctEffortCaps + asks.length < 2) return [];
      return asks.slice(0, 2 - distinctEffortCaps);
    }
    return asks.slice(0, MAX_STEPS);
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
      reviews: steps.flatMap((s) => s.reviews),
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

  // ", 6 of them examples" / ", all examples" / "" for a set of reviews.
  function exampleNote(reviews) {
    const n = reviews.length;
    const e = reviews.filter((r) => r.source === 'example').length;
    if (!e) return '';
    if (e === n) return n === 1 ? ', an example' : ', all examples';
    return `, ${e} of them ${e === 1 ? 'an example' : 'examples'}`;
  }

  // "9 reviews, 6 of them examples"
  function reviewCount(reviews) {
    return plural(reviews.length, 'review', 'reviews') + exampleNote(reviews);
  }

  function showSetupProgress(m) {
    if (m.type === 'download') showProgress(m);
    else if (m.type === 'ready') {
      els.progressText.textContent = 'Getting ready…';
      els.progressBar.removeAttribute('value');
    }
  }

  function showProgress(m) {
    els.progress.hidden = false;
    if (m.type === 'download') {
      const mb = (b) => Math.round(b / 1e6);
      els.progressText.textContent = `Downloading the AI model: ${mb(m.loaded)} of ${mb(m.total)} MB. This happens only once.`;
      els.progressBar.value = m.total ? (m.loaded / m.total) * 100 : 0;
    } else if (m.type === 'ready') {
      els.progressText.textContent = 'Reading your reviews…';
      els.progressBar.removeAttribute('value');
    } else if (m.type === 'embedded') {
      els.progressText.textContent = `Reading your reviews: ${m.done} of ${m.total}`;
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
    if (tooShort.length) {
      const d = renderTheme('Too short to use for themes', tooShort, null, true);
      d.querySelector('.theme-count').textContent = `${reviewCount(tooShort)} · kept, but not used`;
      frag.appendChild(d);
    }
    if (tooSmallLeftovers.length) {
      frag.appendChild(renderTheme('Comments that fit no theme', tooSmallLeftovers, null, true));
    }
    if (!groups.length) frag.appendChild(el('p', 'muted', 'No feedback to group yet.'));
    els.themes.replaceChildren(frag);
  }

  function renderTheme(label, reviews, theme, forceSmall = false) {
    const enough = !forceSmall && reviews.length >= MIN_SUPPORT;
    const d = el('details', `theme${enough ? '' : ' theme-small'}`);
    const s = el('summary');
    s.appendChild(el('span', 'theme-label', label));
    let countText;
    if (!enough) countText = `Not enough feedback yet (${reviewCount(reviews)})`;
    else if (!theme) countText = `${reviewCount(reviews)} · cannot be used, no name`;
    else if (theme.kind === 'strength') countText = `${reviewCount(reviews)} · guests like this`;
    else countText = reviewCount(reviews);
    s.appendChild(el('span', 'theme-count', countText));
    d.append(s, renderReviewList(reviews));
    return d;
  }

  function renderReviewList(reviews) {
    const ul = el('ul', 'theme-reviews');
    for (const r of reviews) {
      const li = el('li', null, r.text);
      const lang = Language.guess(r.text);
      if (lang) li.appendChild(el('span', 'tag tag-lang inline-tag', lang === 'Not in English' ? lang : `Appears to be ${lang}`));
      if (r.source === 'example') li.appendChild(el('span', 'tag tag-example inline-tag', 'Example'));
      ul.appendChild(li);
    }
    return ul;
  }

  function loadAccepted() {
    return Store.load(ACCEPTED_KEY);
  }

  function isAccepted(option) {
    const a = loadAccepted();
    return a && a.tier === option.tier.id && a.name === option.name && a.capIds?.join() === option.caps.map((c) => c.id).join();
  }

  function renderNotice() {
    const p = el('p', 'pkg-notice', notice.text);
    if (notice.undo) {
      const undo = el('button', 'btn btn-secondary btn-undo', 'Undo');
      undo.type = 'button';
      undo.addEventListener('click', onUndo);
      p.append(' ', undo);
    }
    return p;
  }

  function renderPackage(result) {
    const frag = document.createDocumentFragment();
    if (notice) frag.appendChild(renderNotice());

    if (!result.anyOk) {
      frag.appendChild(renderNoPackage(result));
      els.pkg.replaceChildren(frag);
      return;
    }

    frag.appendChild(el('p', 'muted small', 'Three options, cheapest first. Each one is built only from what guests said and what your farm can do.'));
    markBuildsOn(result.options);
    for (const option of result.options) frag.appendChild(renderOption(option));

    // Themes blocked only by unanswered items are asked about on the tier cards.
    const notCovered = result.missing.filter((m) => !m.unknown);
    if (notCovered.length) {
      frag.appendChild(el('p', 'pkg-also',
        `Guests also asked about: ${notCovered.map((m) => `${m.theme.label} (${reviewCount(m.reviews)})`).join('; ')}. ` +
        'Nothing marked Yes or With effort on your farm covers this yet.'));
    }
    els.pkg.replaceChildren(frag);
  }

  // Questions about unanswered farm items that are blocking an option.
  function renderAsks(asks, lead) {
    const wrap = el('div', 'pkg-ask');
    wrap.appendChild(el('p', 'pkg-ask-lead', lead));
    for (const a of asks) {
      const item = el('div', 'pkg-ask-item');
      const q = el('p', 'pkg-ask-name', `Can you offer “${a.cap.name}”?`);
      q.id = `ask-${a.cap.id}-${Math.random().toString(36).slice(2, 7)}`;
      item.appendChild(q);
      item.appendChild(el('p', 'pkg-trace', `Guests asked for this: “${a.theme.label}” (${reviewCount(a.reviews)}).`));
      const choice = el('div', 'choice');
      choice.setAttribute('role', 'group');
      choice.setAttribute('aria-labelledby', q.id);
      for (const status of ['yes', 'effort', 'no']) {
        const b = el('button', null, STATUS_LABELS[status]);
        b.type = 'button';
        b.dataset.status = status;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => onAnswer(a.cap, status));
        choice.appendChild(b);
      }
      item.appendChild(choice);
      wrap.appendChild(item);
    }
    return wrap;
  }

  function tierAskLead(option) {
    const n = option.ask.length;
    const them = n === 1 ? 'it' : 'them';
    const mark = option.tier.id === 'none' ? 'Yes' : 'With effort';
    return `You have not answered ${n === 1 ? 'this item' : 'these items'} on your farm list yet. ` +
      `If you can mark ${them} ${mark}, this option can be built.`;
  }

  function renderNoPackage(result) {
    const box = el('div', 'pkg pkg-none');
    box.appendChild(el('p', 'pkg-kicker', 'No package yet'));
    box.appendChild(el('h2', null, 'A package cannot be built from what you have now.'));
    const ul = el('ul', 'pkg-missing');
    for (const reason of whyNoPackage(result)) ul.appendChild(el('li', null, reason));
    box.appendChild(ul);

    // Unanswered items that could unlock an option: ask about each one once.
    const asks = [];
    for (const o of result.options) {
      for (const a of o.ask || []) if (!asks.some((x) => x.cap.id === a.cap.id)) asks.push(a);
    }
    if (asks.length) {
      box.appendChild(el('p', 'pkg-subhead', asks.length === 1 ? 'A question for you' : 'Questions for you'));
      box.appendChild(renderAsks(asks, 'You have not answered these on your farm list yet. Your answer may give you an option.'));
    }

    // Something she can act on is always shown.
    if (totalCount && result.near.length) {
      box.appendChild(el('p', 'pkg-subhead', 'Closest to an option'));
      const nl = el('ul', 'pkg-missing');
      for (const n of result.near) {
        nl.appendChild(el('li', null,
          `“${n.theme.label}”: ${reviewCount(n.reviews)}. You have “${n.cap.name}” (${STATUS_LABELS[n.cap.status]}). ` +
          `${plural(n.short, 'more review', 'more reviews')} about this would give you an option.`));
      }
      box.appendChild(nl);
    }
    if (totalCount) {
      box.appendChild(el('p', 'pkg-next',
        'What to do next: ask your next guests what they liked and what they missed, and add what they say on the Feedback screen.'));
    }
    return box;
  }

  // "Hand roaster (pan or drum over fire), marked Yes"
  function capUse(c) {
    return `${c.name}, marked ${STATUS_LABELS[c.status]}`;
  }

  // When an option contains every step of a cheaper one, say so, so she does
  // not read the same steps twice without knowing why.
  function markBuildsOn(options) {
    options.forEach((o, i) => {
      if (!o.ok) return;
      for (let j = i - 1; j >= 0; j--) {
        const base = options[j];
        if (!base.ok) continue;
        const has = new Set(o.steps.map((s) => s.theme.id));
        if (base.steps.every((s) => has.has(s.theme.id))) {
          const baseIds = new Set(base.steps.map((s) => s.theme.id));
          const added = o.steps.filter((s) => !baseIds.has(s.theme.id)).map((s) => s.theme.title);
          o.buildsOn = `Builds on ${base.tier.title.split(' · ')[0]}, adding ${joinWords(added)}.`;
        }
        return;
      }
    });
  }

  function renderOption(option) {
    const box = el('div', 'pkg');
    box.appendChild(el('p', 'pkg-kicker', option.tier.title));

    if (!option.ok) {
      box.classList.add('pkg-none');
      if (option.ask.length) {
        box.appendChild(el('p', 'pkg-cannot',
          option.ask.length === 1 ? 'Not built yet: one answer is missing.' : `Not built yet: ${option.ask.length} answers are missing.`));
        box.appendChild(renderAsks(option.ask, tierAskLead(option)));
      } else {
        box.appendChild(el('p', 'pkg-cannot', 'Cannot be built yet. It needs:'));
        const ul = el('ul', 'pkg-needs');
        for (const n of option.needs) ul.appendChild(el('li', null, n));
        box.appendChild(ul);
      }
      return box;
    }

    box.appendChild(el('h2', null, option.name));
    box.appendChild(el('p', 'pkg-cost', option.tier.cost));
    if (option.buildsOn) box.appendChild(el('p', 'pkg-builds', option.buildsOn));

    const ol = el('ol', 'pkg-steps');
    for (const s of option.steps) {
      const li = el('li');
      li.appendChild(el('p', 'pkg-step', s.theme.step));
      const trace = el('p', 'pkg-trace');
      trace.append(
        el('span', null, `Because: ${reviewCount(s.reviews)}, “${s.theme.label}”`),
        el('br'),
        el('span', null, `Uses: ${capUse(s.cap)}`),
      );
      li.appendChild(trace);
      ol.appendChild(li);
    }
    box.appendChild(ol);

    box.appendChild(el('p', 'pkg-evidence',
      `Evidence: ${plural(option.reviews.length, 'review supports', 'reviews support')} this${exampleNote(option.reviews)}. ` +
      `Uses: ${option.caps.map(capUse).join('; ')}.`));
    box.appendChild(el('p', 'pkg-test',
      `Test: offer it to your next ${TEST_VISITORS} visitors. Keep it if at least ${TEST_KEEP} of them say yes.`));

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
      if (tooShort.length) {
        reasons.push(`${reviewCount(tooShort)} ${tooShort.length === 1 ? 'is' : 'are'} too short to use for themes, like “${tooShort[0].text}”. ` +
          'Reviews that say what guests liked or missed are needed.');
      }
      if (totalCount > tooShort.length) {
        reasons.push('Reviews in Sinhala or Tamil are not counted; see the Feedback screen.');
      }
      return reasons;
    }
    if (!pkg.supported.length) {
      reasons.push(`No theme has ${MIN_SUPPORT} or more reviews yet.`);
      const best = groups.find((g) => g.theme);
      if (best && !pkg.near.length) reasons.push(`Closest so far: “${best.theme.label}” with ${reviewCount(best.reviews)}.`);
      return reasons;
    }
    if (!pkg.buildable.length) {
      reasons.push(`Guests mostly praised things you already do (${pkg.supported.map((g) => g.theme.label).join('; ')}). No request or problem has ${MIN_SUPPORT} or more reviews yet.`);
      return reasons;
    }
    for (const m of pkg.missing) {
      const head = `Guests: “${m.theme.label}” (${reviewCount(m.reviews)}).`;
      if (m.unknown) {
        reasons.push(`${head} You have not said yet whether you can offer “${m.unknown.name}”. See the question below.`);
      } else if (m.linked.length) {
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
      reviewCount: option.reviews.length,
      exampleCount: option.reviews.filter((r) => r.source === 'example').length,
      acceptedAt: new Date().toISOString(),
    });
    notice = null;
    renderPackage(await propose());
  }

  // Always asks which item, and tapping it is the confirmation.
  function onCannot(option, box, actions) {
    const ask = el('div', 'pkg-which');
    ask.appendChild(el('p', null, option.caps.length > 1 ? 'Which one can you not do?' : 'Is this the one you cannot do?'));
    ask.appendChild(el('p', 'pkg-which-hint', 'Tapping it marks it No on your farm list. You can undo this.'));
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
    ask.scrollIntoView({ block: 'nearest' });
  }

  async function markCannot(cap) {
    Profile.setStatus(cap.id, 'no');
    notice = {
      text: `Changed on your farm list: “${cap.name}” is now No (it was ${statusLabel(cap.status)}).`,
      undo: { id: cap.id, name: cap.name, prev: cap.status },
    };
    renderPackage(await propose());
    showNotice();
  }

  // Her answer to a question about an unanswered item.
  async function onAnswer(cap, status) {
    Profile.setStatus(cap.id, status);
    notice = {
      text: `Saved on your farm list: “${cap.name}” is now ${statusLabel(status)}.`,
      undo: { id: cap.id, name: cap.name, prev: cap.status },
    };
    renderPackage(await propose());
    showNotice();
  }

  async function onUndo() {
    const { id, name, prev } = notice.undo;
    Profile.setStatus(id, prev);
    notice = { text: `Undone: “${name}” is back to ${statusLabel(prev)}.` };
    renderPackage(await propose());
    showNotice();
  }

  function showNotice() {
    els.pkg.querySelector('.pkg-notice')?.scrollIntoView({ block: 'start' });
  }

  // ---------- Flow ----------

  async function run() {
    if (running) return;
    running = true;
    notice = null;
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
