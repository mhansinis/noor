# VestaFuture

Guest feedback into an experience package you can actually deliver.

Built for the World Bank Group Small AI for Development Hackathon 2026, tourism challenge. Solo entry by Mariyan Silva, Sri Lanka.

**Live demo** https://mhansinis.github.io/noor/

---

## The problem

Noor runs coffee farm visits in the Sri Lankan hill country. Six or seven guests a month find her by word of mouth. They leave happy, and she never finds out what they valued or what they wished she offered.

Her feedback already exists. It is scattered across Google reviews, WhatsApp messages and things guests said at the gate that nobody wrote down, in four languages. Reading across all of it to find a pattern is analytical work she has no time, tooling or connectivity to do.

VestaFuture does that work on her own phone, offline, and turns it into three concrete experience packages ranked by cost, each one traceable back to the reviews that justify it and the farm assets she already has.

---

## What it does

**1. My farm.** She records what the farm has and what she can do. Each item is marked Yes, With effort or No. She can add her own items. Unanswered means unknown, not no.

**2. Guest feedback.** She pastes reviews copied straight from Google or Booking.com, however messy, or types what a guest said at the gate. A rule based parser splits the blob, discards reviewer names, dates, star ratings, owner replies and site furniture, strips phone numbers and email addresses, and shows her everything it found before anything is saved.

**3. Themes and package.** A small multilingual embedding model reads the saved feedback on the device and matches each review to a fixed set of theme descriptions. Themes with fewer than three supporting reviews are shown but never used. Matched themes are then checked against her farm profile, and three experience packages are assembled from fixed templates, ranked no cost, low cost and higher investment.

Every step in every package carries an evidence line naming how many reviews support it and which of her own capabilities it uses. She confirms each one with "I can do this" or "I cannot", and a "cannot" updates her profile and re-proposes.

---

## How it is built

Plain HTML, CSS and JavaScript. No framework, no build step, no backend, no account.

| Layer | Choice |
|---|---|
| Embedding model | `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantised, about 118 MB |
| Runtime | Transformers.js, loaded from CDN once, then cached |
| Inference | Web Worker, so the interface stays responsive |
| Matching | Cosine similarity against fixed theme sentences |
| Package assembly | Deterministic rules plus fixed templates. No generative text |
| Storage | `localStorage` on the device |
| Offline | Service worker caches app shell and model files |
| Build assistance | Claude Code |

### Why fixed themes rather than free clustering

Free clustering grouped reviews by language rather than by meaning, which produced themes that did not exist. Comparing each review against a fixed, human readable set of theme descriptions makes every match checkable and keeps the output stable.

### Why templates rather than a language model

A generative step could invent a farm asset Noor does not own, or a price she never set. Assembling packages from templates means the tool can only propose what her own profile and her own reviews support. This is the hallucination guard, and it is structural rather than a prompt instruction.

### Guardrails

- A theme needs three or more supporting reviews before it is used for anything
- Very short or vague reviews are kept but excluded from theme matching
- Sinhala and Tamil reviews are saved but not counted, with the reason shown on screen
- No package is ever shown without the evidence behind it
- Where a package cannot be built, the app names exactly what is missing rather than failing silently
- Nothing is sent anywhere. Personal details are removed at ingest rather than stored and protected

---

## Running it locally

```bash
git clone https://github.com/mhansinis/noor.git
cd noor
node serve.js
```

Open http://localhost:8000

The embedding model downloads once on first analysis, roughly 118 MB. After that, switch the network off and the app keeps working. That is the core claim and it is reproducible in about two minutes.

To test on an Android phone, put the phone on the same network and open the LAN address printed by the server.

---

## Repository layout

```
index.html              markup for all three screens
style.css               styling, phone first
serve.js                small dependency free local server
sw.js                   service worker, offline caching
js/app.js               screen routing
js/profile.js           My farm screen and the capability list
js/feedback.js          Guest feedback screen
js/paste-parser.js      rule based blob parsing and privacy stripping
js/vague.js             detects reviews too short to carry meaning
js/analysis.js          theme matching, thresholds, package assembly
js/embed-worker.js      Transformers.js embedding in a Web Worker
js/ai.js                model loading and caching
js/storage.js           localStorage read and write
js/example-reviews.js   30 synthetic reviews, clearly labelled
```

---

## Data

The app ships with 30 synthetic guest reviews so the pipeline can be demonstrated without real customer data. They are labelled as examples in the interface and in the evidence counts, so a package built partly on them says so. See `DATASET.md`.

No real guest data was used in building or testing this.

---

## Known limitations

**Sinhala and Tamil are set aside.** The model reads them, but groups them by language rather than by meaning. Tested against `Xenova/multilingual-e5-small` as an alternative and the behaviour persisted. Counting them would have produced a theme that was not real, so the app declines to use them and says why. This is the most important finding of the build and it is described in full in the one page report.

**The interface is in English.** The tool reads several languages. It does not yet speak Noor's.

**Re-reading on every open.** Embeddings are recomputed each session, roughly 15 seconds on a laptop and longer on a cheap phone. Caching embeddings per review is the obvious fix and was out of scope for the build window.

**Themes are a fixed list.** A farm whose guests care about something outside that list will see it fall into "comments that fit no theme". Expanding and eventually learning the theme set is the next piece of work.

**No PIN or encryption at rest.** A deliberate decision rather than an omission. The data is guest comments and a list of farm assets, identifying details are stripped at ingest rather than stored, and nothing leaves the device. A lock screen before a first time user knows what the app is for costs more than it protects. If the tool later stores anything sensitive, a PIN with an encrypted export is the right next step.

---

## Licence

MIT.
