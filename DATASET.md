# Dataset

## Summary

No external dataset was used. No real guest data was used. The project ships one small synthetic dataset, generated during the hackathon, so the pipeline can be demonstrated end to end without exposing a real operator's customers.

**File** `js/example-reviews.js`
**Link** https://github.com/mhansinis/noor/blob/main/js/example-reviews.js
**Size** 30 records
**Licence** MIT, same as the repository

---

## Why synthetic

No public dataset exists of multilingual guest reviews for smallholder farm tourism in Sri Lanka. Scraping real reviews from Google or Booking.com would have put identifiable guest comments and a real business into a hackathon repository, which the privacy design of this tool exists to avoid.

Synthetic data was generated instead, written to resemble the language, length and mix of real reviews for a coffee farm visit, including the mess. The generation was done with Claude.

---

## Composition

| Field | Detail |
|---|---|
| Records | 30 |
| Languages | English 12, German 7, French 6, Sinhala 5 |
| Mean length | roughly 15 to 25 words |
| Signal clusters | roasting 6, wanting to taste the coffee 6, steep walk 4 |
| Remainder | 14 varied and unrelated, covering directions, leeches, card payment, children picking cherries, buying beans, cinnamon peeling |

The signal clusters are deliberate. They give the theme matcher something real to find while leaving most of the set as noise, which is closer to a genuine review pile than a tidy set would be.

---

## Labelling

Every record carries an `example` flag. This is surfaced to the user, not only held in code.

- The saved feedback list tags each one as **Example**
- Theme counts read "6 reviews, 5 of them examples"
- Package evidence lines read "9 reviews support this, 7 of them examples"
- A single button removes all example records and leaves the user's own feedback untouched

A package built partly on synthetic data says so on screen. That was a design requirement, not a nicety.

---

## Fields

Each record holds the review text, a language code, and the example flag. No author names, no dates, no ratings, no identifiers. Nothing that would exist in a real pile is kept beyond the text itself.

---

## Known gaps

**It is not real.** Synthetic reviews are cleaner in their signal than a real pile would be. Real feedback is more repetitive, more ambiguous and more often about things outside any theme list. Performance on this set is a demonstration that the pipeline works, not a measurement of accuracy.

**It is one business.** Thirty reviews of one coffee farm. Nothing here shows how the theme set holds up for a guesthouse, a surf school or a spice garden.

**Sinhala was written, not collected.** The five Sinhala records were composed rather than gathered from Sinhala speaking guests, so they may read more formally than real ones would. They were still enough to surface the language clustering failure described in the report, and that finding would hold more strongly with natural data, not less.

---

## Testing data

The messy paste parser was tested against hand constructed blobs in Google Reviews and Booking.com layout, including reviewer names, "Local Guide" lines, relative dates, star words, owner replies, "Translated by Google" pairs and a phone number in the review body. These were written for testing and are not part of the shipped dataset.
