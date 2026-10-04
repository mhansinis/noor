// Spots reviews too short or vague to say what guests liked or missed:
// "Amazing!", "Very good", "Great tour", "Sehr gut", "Très bien".
// They are kept as real reviews but not used for themes.
//
// Rule: at most MAX_WORDS words, and every word is general praise or filler.
// A review with any concrete word ("Lovely views", "Too steep") is not vague.
const Vague = (() => {
  const MAX_WORDS = 4;
  const WORDS = new Set(
    `
    amazing nice good great excellent super superb perfect wonderful lovely awesome fantastic brilliant
    beautiful fabulous incredible outstanding best fine ok okay cool fun wow top recommended recommend
    highly very really so truly just absolutely totally simply quite
    thanks thank you love loved liked enjoyed it this that was is were all everything
    place tour visit trip experience time day stay farm
    a an the and of for our we us 5 five star stars 10
    toll schön gut sehr prima klasse wunderbar wunderschön super spitze empfehlenswert danke alles war ist
    die der das ein eine und
    tolle toller tolles schöne schöner schönes gute guter gutes tollen schönen guten
    erlebnis ausflug führung besuch tag
    génial genial magnifique parfait parfaite bien très tres top merci beaucoup superbe excellent excellente
    c'était c’était était tout un une le la les et
    expérience visite séjour moment journée
    `
      .trim()
      .split(/\s+/),
  );

  function isVague(text) {
    const words = text
      .toLowerCase()
      .replace(/\[(?:email|phone|name)\]/g, ' ')
      .match(/[\p{L}\p{N}'’]+/gu);
    if (!words) return true;
    return words.length <= MAX_WORDS && words.every((w) => WORDS.has(w));
  }

  return { isVague };
})();
