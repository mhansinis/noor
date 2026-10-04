// Removes personal details from guest feedback before it is stored.
//
// Pattern-based, so it is honest about its limits:
//   - email addresses, phone numbers and @handles are removed reliably;
//   - names are removed only where they are easy to recognise: sign-offs
//     ("– Anna", "Thanks, Anna K."), "Name: …" or "Name (Country): …" at the
//     start, and "my name is …" in English, French and German.
// A name written in the middle of a sentence ("we came with Peter") is not
// caught. The analysis only needs what guests said, never who said it.
const Privacy = (() => {
  const NAME = '\\p{Lu}[\\p{L}\'’-]+';
  const ONE = `${NAME}(?:\\s+(?:${NAME}|\\p{Lu}\\.))?(?:\\s+${NAME})?`; // 1–3 capitalised words
  const NAME_RUN = `${ONE}(?:\\s*(?:and|&|und|et|y)\\s+${ONE})?`; // "Sarah and Tom"

  // Capitalised words that follow a sign-off or start a line but are not names.
  const NOT_NAMES = new Set([
    'Beaucoup', 'Schön', 'Sehr', 'Vielmals', 'Again', 'So', 'Much', 'Everyone', 'All',
    'Note', 'Tip', 'Update', 'Edit', 'Highlight', 'Highlights', 'Pros', 'Cons', 'Overall', 'Summary',
  ]);
  const isName = (run) => !NOT_NAMES.has(run.split(/\s+/)[0]);

  const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
  const HANDLE = /(^|[\s(])@[\p{L}\p{N}_.]{2,}/gu;
  const PHONE = /(?:\+|\b)\d[\d\s().\/-]{5,}\d\b/g;
  const YEAR_RANGE = /^\d{4}\s*[-–\/]\s*\d{4}$/;

  const INTRO = new RegExp(
    `\\b((?:[Mm]y name is|[Ii] am called|[Jj]e m['’]appelle|[Mm]ein [Nn]ame ist|[Ii]ch hei(?:ß|ss)e)\\s+)(${NAME_RUN})`,
    'gu',
  );
  const PREFIX = new RegExp(`^(${NAME_RUN})\\s*(?:\\([^)]{0,40}\\))?\\s*:\\s+`, 'u');
  const SIGNOFF = new RegExp(
    `((?:^|[\\s,.!])(?:[-–—~]\\s*|(?:[Tt]hanks|[Tt]hank you|[Cc]heers|[Rr]egards|[Bb]est wishes|[Mm]erci|[Dd]anke|[Gg]rüße|[Gg]ruß)[,!.]?\\s+))(${NAME_RUN})\\.?\\s*[.!]?\\s*$`,
    'u',
  );

  // Returns { text, removed } where removed is true if anything was taken out.
  function scrub(input) {
    let text = String(input);
    const before = text;

    text = text.replace(EMAIL, '[email]');
    text = text.replace(HANDLE, '$1[name]');
    text = text.replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, '').length;
      return digits >= 7 && !YEAR_RANGE.test(m.trim()) ? '[phone]' : m;
    });
    text = text.replace(INTRO, '$1[name]');
    text = text.replace(PREFIX, (m, run) => (isName(run) ? '' : m));
    text = text.replace(SIGNOFF, (m, lead, run) => (isName(run) ? `${lead}[name]` : m));

    text = text.replace(/\s{2,}/g, ' ').trim();
    return { text, removed: text !== before.trim() };
  }

  // True if nothing useful is left (only removed details and punctuation).
  function isEmpty(text) {
    return !text.replace(/\[(?:email|phone|name)\]/g, '').replace(/[\s\p{P}\p{S}]/gu, '');
  }

  return { scrub, isEmpty };
})();
