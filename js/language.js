// Guesses which language a review is in, with fixed rules, so the app can
// tell her when a review is not in English. Nothing is translated: that would
// need a model the app does not have offline.
//
// guess(text) returns a language name ("German"), "Not in English" when it is
// clearly not English but the language is unclear, or null for English or
// when there is too little to tell.
const Language = (() => {
  // Writing systems other than Latin identify the language (or family) directly.
  const SCRIPTS = [
    ['Sinhala', /[඀-෿]/],
    ['Tamil', /[஀-௿]/],
    ['Hindi or another Devanagari language', /[ऀ-ॿ]/],
    ['Japanese', /[぀-ヿ]/],
    ['Korean', /[가-힯]/],
    ['Chinese', /[一-鿿]/],
    ['Russian or another Cyrillic language', /[Ѐ-ӿ]/],
    ['Arabic', /[؀-ۿ]/],
    ['Hebrew', /[֐-׿]/],
    ['Thai', /[฀-๿]/],
    ['Greek', /[Ͱ-Ͽ]/],
  ];

  // Common short words that are typical of each language.
  const WORDS = {
    English: 'the and was were we our is it to of with very but for this that you they have had would could',
    German: 'der die das und ist war wir sehr nicht ein eine mit zu auf für es ich uns den dem hat haben hätte wurde man zum',
    French: 'le la les et est était nous très pas un une des du au aux avec pour ce on qui que il elle avons',
    Spanish: 'el los las y es muy una con para que fue nos del pero lo por hay estaba',
    Italian: 'il lo gli è molto una con per che era ci non della degli nel abbiamo',
    Dutch: 'de het een en is was zeer heel niet wij we met voor van ons waren hebben',
    Portuguese: 'os as é muito uma com para que foi não nós do da dos das em',
  };
  const WORD_SETS = Object.fromEntries(
    Object.entries(WORDS).map(([lang, list]) => [lang, new Set(list.split(' '))]),
  );

  // Letters that point strongly to one language.
  const LETTERS = [
    ['German', /[ßäöü]/i],
    ['French', /[çœèêëîôù]|\b[cdjlmnst]['’]\p{L}/iu],
    ['Spanish', /[ñ¿¡]/i],
    ['Portuguese', /[ãõ]/i],
    ['Italian', /[ìò]/i],
  ];

  function guess(text) {
    for (const [name, re] of SCRIPTS) if (re.test(text)) return name;

    const words = text.toLowerCase().match(/\p{L}+(?:['’]\p{L}+)?/gu) || [];
    const score = Object.fromEntries(Object.keys(WORD_SETS).map((l) => [l, 0]));
    for (const w of words) {
      for (const [lang, set] of Object.entries(WORD_SETS)) if (set.has(w)) score[lang] += 1;
    }
    for (const [lang, re] of LETTERS) if (re.test(text)) score[lang] += 2;
    // 'é' and 'à' are common in French and rare in Dutch, which shares 'de' and 'en'.
    if (/[éà]/i.test(text)) score.French += 1;

    const ranked = Object.entries(score)
      .filter(([l]) => l !== 'English')
      .sort((a, b) => b[1] - a[1]);
    const [best, bestScore] = ranked[0];
    const secondScore = ranked[1][1];
    // Not enough signal, or English looks at least as likely: say nothing.
    if (bestScore < 2 || bestScore <= score.English) return null;
    return bestScore > secondScore ? best : 'Not in English';
  }

  return { guess };
})();
