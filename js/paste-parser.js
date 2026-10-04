// Splits a messy paste (Google Maps, Booking.com, TripAdvisor, a Word
// document) into separate reviews using fixed rules. No model is involved,
// so it works offline and can only keep or drop text that was pasted, never
// add any. Each review is the pasted text, with interface clutter removed
// from its start or end.
//
// parse(blob) returns:
//   reviews:  [{ text }]          what looks like guest review text
//   dropped:  [{ text, why }]     lines left out, with a short reason
const PasteParser = (() => {
  // ---- Lines that are interface text, not review text ----

  const STARS = /^[\s★☆⭐✩✪✭✮✯✰*·•]+$/u;
  const RATING = [
    /^\(?\d+([.,]\d)?\s*(\/|out of|sur|von|of)\s*(5|10)\)?(\s*(stars?|étoiles?|sterne?n?))?\.?$/i, // 4/5, 4.5 out of 5
    /^(rated|bewertet mit|noté)\s+\d+([.,]\d)?\b.*$/i,
    /^\d+([.,]\d)?\s*(stars?|étoiles?|sterne?n?)$/i,
    /^(score|note|punktzahl|bewertung)\s*:?\s*\d+([.,]\d)?$/i,
    /^\d{1,2}([.,]\d)?$/, // "9.2" or "8" on its own (Booking score)
    // Booking score word with its score on the same line: "Wonderful 9.0"
    /^(exceptional|superb|fabulous|wonderful|very good|good|pleasant|okay|poor|disappointing|review score|exceptionnel|superbe|fabuleux|très bien|bien|außergewöhnlich|hervorragend|fabelhaft|sehr gut|gut)\s*\d+([.,]\d)?$/i,
  ];
  // A score word on its own ("Very good") is a rating only next to a bare
  // score line ("9.0"); otherwise it is a guest's own (short) review.
  const SCORE_WORD = /^(exceptional|superb|fabulous|wonderful|very good|good|pleasant|okay|poor|disappointing|review score|exceptionnel|superbe|fabuleux|très bien|bien|außergewöhnlich|hervorragend|fabelhaft|sehr gut|gut)$/i;
  const BARE_SCORE = /^\d{1,2}([.,]\d)?$/;
  const DATE = [
    // "2 weeks ago", "a month ago", "vor 3 Monaten", "il y a 2 mois", "Edited 3 days ago"
    /^(edited\s+)?(a|an|one|\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i,
    /^(bearbeitet\s+)?vor\s+(einer?|einem|\d+)\s+(sekunde|minute|stunde|tag|woche|monat|jahr)(e|en|n)?$/i,
    /^(modifié\s+)?il y a\s+(un|une|\d+)\s+(seconde|minute|heure|jour|semaine|mois|an)s?$/i,
    /^(yesterday|today|gestern|heute|hier|aujourd'hui|aujourd’hui)$/i,
    // "last month", "last week", "last year" (and "letzten Monat", "le mois dernier")
    /^(last|past|this)\s+(week|month|year|weekend|summer|winter)$/i,
    /^(letzte[nrs]?|vergangene[nrs]?)\s+(woche|monat|jahr|wochenende|sommer|winter)$/i,
    /^(la|le|l'|l’)\s*(semaine|mois|année|an|week-end|été|hiver)\s+(dernière|dernier)$/i,
    // "12 March 2025", "March 2025", "12/03/2025", "2025-03-12", "Mar 12, 2025"
    /^(reviewed|date of stay|stayed in|visited in|date of visit|written|bewertet am|datum|écrit le|séjour)\s*:?.*\d{4}.*$/i,
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/,
    /^\d{4}-\d{2}-\d{2}$/,
    /^(\d{1,2}\.?\s+)?[\p{L}]{3,10}\.?\s+(\d{1,2},?\s+)?\d{4}$/u,
    /^\d+\s+(night|nights|nuit|nuits|nacht|nächte)\b.*$/i, // "1 night · March 2025"
  ];
  const UI = [
    /^local guide\b.*$/i, // "Local Guide · 45 reviews · 120 photos"
    /^\d+\s+(reviews?|photos?|bewertungen|rezensionen|fotos|avis|contributions?|helpful votes?)(\s*[·•,]\s*\d+\s+\p{L}+)*$/iu,
    /^(helpful|not helpful|like|share|report|reply|more|read more|less|show more|show less|see more|see original|show original|translate|translated by google|hilfreich|teilen|melden|mehr|weiterlesen|utile|partager|signaler|plus|lire la suite|voir l'original|voir l’original)\s*(\(\d+\))?$/i,
    /^\d+\s+(people found this helpful|person found this helpful|helpful|likes?)$/i,
    /^(new|neu|nouveau)$/i,
    /^(liked|disliked|pros|cons|positive|negative|gefallen|nicht gefallen|a aimé|n'a pas aimé|n’a pas aimé)\s*[:·]?$/i,
    /^(couple|solo traveller|solo traveler|family with young children|family with older children|group|group of friends|business traveller|paar|familie|alleinreisend|en couple|famille|voyageur individuel)$/i,
    /^stayed in\b.{0,40}$/i, // "Stayed in Deluxe Double Room"
    /^(trip type|reiseart|type de voyage)\s*:.{0,30}$/i,
    /^(written by|reviewed by|posted by)\s+.{1,40}$/i,
    /^(this review is the subjective opinion|cet avis est l'opinion|diese bewertung ist die subjektive).*$/i,
  ];
  // Markers after which the next block is not the guest's own text.
  const OWNER_REPLY = /^(response from the owner|response from the property|owner's response|owner’s response|antwort des inhabers|antwort vom inhaber|réponse du propriétaire|réponse de l'établissement|réponse de l’établissement)\b.*$/i;
  // "(Original)" alone, or at the start of a line with the source text after it.
  const ORIGINAL = /^(\((original|originaltext|texte original)\)|(original|originaltext|texte original)\s*:?$)/i;

  // A reviewer name or country on its own: 1–4 capitalised words, no
  // sentence punctuation, no digits. ("Anna Schmidt", "Pierre D.", "Germany")
  const NAME_LIKE = /^(\p{Lu}[\p{L}'’-]*\.?)(\s+(\p{Lu}[\p{L}'’-]*\.?|de|van|von|der|da|di|le|la))*\s*$/u;
  const MAX_NAME_WORDS = 4;
  // Names joined by "and": "David and Jen", "Sarah & Tom Miller", "Jonas und Lena".
  const ONE_NAME = '\\p{Lu}[\\p{L}\'’-]*\\.?(?:\\s+\\p{Lu}[\\p{L}\'’-]*\\.?){0,2}';
  const NAME_PAIR = new RegExp(`^${ONE_NAME}\\s*(?:and|&|und|et|y|e)\\s+${ONE_NAME}\\s*$`, 'u');

  // Removed from the start or end of a line, keeping the rest.
  const LEAD_CLUTTER = [
    /^\s*(?:[-–—•*▪◦·]|\d{1,3}[.)])\s+/, // bullets and "1." numbering from Word
    /^\(translated by google\)\s*/i,
    /^\((übersetzt von google|traduit par google)\)\s*/i,
    /^(liked|disliked|pros|cons|gefallen|nicht gefallen|a aimé|n'a pas aimé|n’a pas aimé)\s*[:·-]\s*/i, // "Liked · Lovely host"
    /^[★☆⭐]+\s*/u,
  ];
  // "…More" only after an ellipsis, so "come back for more" keeps its last word.
  const TRAIL_CLUTTER = [/\s*(…|\.\.\.)\s*(more|mehr|plus)$/i, /\s*(…|\.\.\.)?\s*(read more|lire la suite|weiterlesen)$/i];

  // Words that, at the end of a line, mean the sentence continues on the next.
  const CONTINUES = /(,|;|:|-|–|\b(and|or|but|the|a|an|to|of|with|for|in|on|at|our|we|was|und|oder|aber|die|der|das|mit|für|et|ou|mais|le|la|les|de|du|des|avec|pour))$/i;
  const ENDS_SENTENCE = /[.!?…)"”»]$/;

  function classify(line) {
    if (STARS.test(line)) return 'star rating';
    if (RATING.some((r) => r.test(line))) return 'rating';
    const bare = line.replace(/[.!…]+$/, '');
    if (DATE.some((r) => r.test(bare))) return 'date';
    if (UI.some((r) => r.test(line))) return 'website text';
    if (OWNER_REPLY.test(line)) return 'owner reply';
    if (ORIGINAL.test(line)) return 'original';
    if (NAME_LIKE.test(line) && line.split(/\s+/).length <= MAX_NAME_WORDS) return 'name or place';
    if (NAME_PAIR.test(line)) return 'name or place';
    return null;
  }

  function clean(line) {
    let t = line;
    for (const r of LEAD_CLUTTER) t = t.replace(r, '');
    for (const r of TRAIL_CLUTTER) t = t.replace(r, '');
    return t.trim();
  }

  function parse(blob) {
    const lines = String(blob)
      .replace(/\r\n?/g, '\n')
      .replace(/[   ]/g, ' ')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim());

    const reviews = [];
    const dropped = [];
    let current = null; // lines of the review being built
    let skipping = null; // reason, while skipping an owner reply or original text

    const finish = () => {
      if (current) reviews.push(current.join(' '));
      current = null;
    };

    const nearScore = (i) => {
      const prev = lines.slice(0, i).reverse().find(Boolean);
      const next = lines.slice(i + 1).find(Boolean);
      return BARE_SCORE.test(prev || '') || BARE_SCORE.test(next || '');
    };

    for (const [i, raw] of lines.entries()) {
      if (SCORE_WORD.test(raw) && nearScore(i)) {
        finish();
        dropped.push({ text: raw, why: 'rating' });
        continue;
      }
      if (!raw) {
        // A blank line ends a review, and ends any block being skipped.
        finish();
        skipping = null;
        continue;
      }
      const kind = classify(raw);
      if (kind === 'owner reply' || kind === 'original') {
        finish();
        skipping = kind === 'owner reply' ? 'owner reply' : 'original of a translated review';
        dropped.push({ text: raw, why: skipping });
        continue;
      }
      if (kind) {
        // Interface text sits between reviews, so it also ends one.
        finish();
        dropped.push({ text: raw, why: kind });
        continue;
      }
      if (skipping) {
        dropped.push({ text: raw, why: skipping });
        continue;
      }

      const text = clean(raw);
      if (!/\p{L}.*\p{L}/u.test(text)) {
        dropped.push({ text: raw, why: 'no words' });
        continue;
      }
      // Join to the previous line only if that line clearly runs on.
      const prev = current && current[current.length - 1];
      const runsOn =
        prev && !ENDS_SENTENCE.test(prev) && (CONTINUES.test(prev) || /^\p{Ll}/u.test(text));
      if (runsOn) current.push(text);
      else {
        finish();
        current = [text];
      }
    }
    finish();

    // The same text pasted twice is kept once. Google also shows a cut-off
    // copy ("…More") next to the full text: the shorter copy is dropped.
    const key = (t) => t.toLowerCase().replace(/[\s.…!?]+$/, '');
    const unique = [];
    for (const text of reviews) {
      const k = key(text);
      if (unique.some((u) => key(u.text) === k)) {
        dropped.push({ text, why: 'repeated' });
        continue;
      }
      const longer = k.length >= 15 && reviews.some((o) => o !== text && key(o).length > k.length && key(o).startsWith(k));
      if (longer) dropped.push({ text, why: 'shortened copy' });
      else unique.push({ text });
    }
    return { reviews: unique, dropped };
  }

  return { parse };
})();
