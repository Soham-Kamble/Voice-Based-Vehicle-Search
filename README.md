# Vyngo Voice-Based Vehicle Search — Take-Home Submission

A voice-first assistant for finding used commercial vehicles. Buyer speaks a
need in English/Hinglish → transcribe → extract slots → hard-filter a
catalog → speak back top 3, grounded strictly in catalog data.

## Submission checklist (per the assignment's §8 rules)

- **README** (this file) — setup in < 10 min, component map, tradeoffs, scale answer.
- **Eval set + results** — `eval/eval_utterances.json` (16 test utterances) and
  `eval/run_eval.js` (the harness). Actual run output saved as evidence in
  `eval/results.txt` — 16/16 pass, 0 constraint violations, reproducible
  with `node eval/run_eval.js`.
- **Slides (PDF)** — `docs/slides.pdf` (7 slides: overview, architecture,
  anti-hallucination mechanism, 3 tradeoffs, scale answer). Regeneratable
  with `python3 docs/build_slides.py`.
- **Architecture diagram** — `docs/architecture.svg` / `docs/architecture.png`,
  embedded in slide 2. Every box is one of the 7 required components.

## Run it (< 2 minutes)

```bash
python3 generate_catalog.py   # regenerates catalog.csv (136 listings) — optional, already committed
python3 server.py             # serves the demo at http://localhost:8000
```

Open **http://localhost:8000** in **Chrome** (Web Speech API requires it).
Click the mic, say something like:

> "chhota truck chahiye, 5 lakh ke andar, city delivery ke liye"

or type it into the text box if you're demoing without a mic / on a noisy
call. Try a correction next: *"nahi diesel nahi, CNG chahiye"*, then a
follow-up: *"uska price kitna hai"*.

Run the eval harness (component 7):

```bash
node eval/run_eval.js
```

Currently: **16/16 test utterances pass (100%)**, and a separate
constraint-violation sweep confirms **zero** filter violations across every
returned record. (`eval/run_eval.js` re-derives this from `pipeline.js`
directly — it isn't a hand-checked number.) Full run output, saved as
submittable evidence, is in `eval/results.txt`.

## The 7 components, and where to find them

| # | Component | File | Notes |
|---|---|---|---|
| 1 | Voice interface | `index.html` (mic button, transcript panel) | Push-to-talk, plus a text fallback for noisy-demo resilience |
| 2 | STT | `index.html` (`SpeechRecognition`) | Browser-native, Chrome Web Speech API |
| 3 | Understanding (NLU) | `pipeline.js` → `extractSlots()` | Rule/lexicon-based, rightmost-match resolution (see tradeoff #2) |
| 4 | Catalog + search | `generate_catalog.py`, `pipeline.js` → `filterCatalog()`, `rankResults()` | CSV catalog, hard filters, explainable scoring |
| 5 | Response (+ anti-hallucination) | `pipeline.js` → `composeAnswer()`, `answerFollowUp()` | Template-only, see mechanism below |
| 6 | Conversation state | `pipeline.js` → `updateState()`, `index.html` state panel | Per-slot overwrite, not full reset |
| 7 | Eval + latency | `eval/run_eval.js`, `eval/eval_utterances.json` | Runs the *real* pipeline, not mocks |

`pipeline.js` is the single seam that matters most: it's an isomorphic,
dependency-free module loaded by both `index.html` (browser, `<script>` tag)
and `eval/run_eval.js` (Node, `require`). The eval harness is therefore
testing the exact code the live demo runs — not a parallel reimplementation.

## Zero-hallucination mechanism (the thing §5 in the rubric asks about)

The response stage is **not** an LLM writing a sentence. `composeAnswer()`
and `answerFollowUp()` build the spoken string with plain JS template
literals that interpolate fields **read directly off catalog record
objects** (`r.price`, `r.km_driven`, `r.year`, ...). There is no free-text
generation step between "matched record" and "spoken sentence" — so there is
no channel through which a fabricated number could enter the response. Every
number that comes out of TTS was written into `catalog.csv` by
`generate_catalog.py` beforehand.

**What this does *not* catch:** if the STT stage mishears a number (e.g.
"5 lakh" heard as "50 lakh"), the wrong *filter* gets applied, and the
assistant will confidently return real-but-wrong-for-you vehicles — this is
a slot-extraction accuracy problem, not a hallucination problem, and the
demo doesn't currently correct for it beyond showing the extracted slots on
screen so a human can catch the mismatch. See Q&A prep, below.

## Architecture diagram

See `docs/architecture.svg` (or `docs/architecture.png` for slides). Every
box is one of the 7 required components; arrows show the call sequence for
a single turn, with the eval harness shown as a parallel consumer of the
same `pipeline.js` module the live UI calls — not a separate reimplementation.

## Tradeoffs (minimum 3, as required)

**1. Rule-based NLU vs. LLM function-calling.**
Chose regex/lexicon-based slot extraction over an LLM call. Rejected the LLM
route because (a) it adds a network hop and \$/latency per turn for a task
that's fundamentally closed-vocabulary (a handful of budgets, body types,
fuels, cities, purposes), and (b) it reintroduces exactly the hallucination
surface the assignment is designed to test for — an LLM asked to extract
"budget" from "sasta sa truck" might invent a number. The cost: it's brittle
to phrasing outside the lexicon, and doesn't generalize to genuinely novel
slot types without code changes. If the catalog's attribute set were open-
ended (arbitrary buyer questions, not 5 known slots), I'd flip this
decision — LLM function-calling with a strict JSON schema and a
record-grounded response template would be worth the latency and cost.

**2. Cascaded STT → NLU → TTS vs. speech-to-speech.**
Chose the cascaded pipeline (separate STT, understanding, TTS stages) over
an end-to-end speech-to-speech model. Speech-to-speech (e.g. a realtime
voice model) would cut latency and handle code-switching more gracefully,
but it collapses the "slot state must be inspectable at every turn"
requirement — you lose the intermediate transcript and extracted-slots
checkpoint that make corrections, debugging, and the eval harness possible.
For a search task where correctness (never showing a 6L truck for a 5L
budget) matters more than conversational naturalness, inspectability wins.

**3. Browser-native Web Speech API vs. a dedicated STT/TTS vendor or
open-source model (Whisper / Coqui).**
Chose Web Speech API for both STT and TTS. It's zero-cost, zero-setup,
and has no server-side audio pipeline to build — which matched the
12-16 hour budget. The real cost: it's Chrome-only, needs network access to
Google's recognition service (so it isn't "open-source model" in the
literal sense, and privacy/offline use is out), and its Hindi/Hinglish
recognition is noticeably worse than English. A production version would
likely use a hosted Whisper endpoint (better multilingual accuracy, still
no on-device infra) or Whisper-small self-hosted if volume justified the
GPU cost — see the scale answer below for when that tradeoff flips.

**4 (bonus). Deterministic zero-result relaxation vs. LLM-suggested
relaxation.** `suggestRelaxation()` tries three fixed relaxations in a fixed
order (budget +20%, drop city, drop fuel) and reports how many results each
would unlock, rather than asking a model to creatively suggest alternatives.
Rejected the creative version for the same anti-hallucination reason as
tradeoff #1 — the count it reports must be real and re-checked against the
catalog, which a deterministic re-filter guarantees and a language model
does not.

## The scale question: what breaks first at 100k conversations/month

100k conversations/month ≈ 3,300/day, bursty around business hours — call it
low tens of concurrent sessions at peak for a single-region deployment.
In order of what I'd expect to break first:

1. **Web Speech API's implicit rate limits / vendor dependency.** It's a
   free, undocumented-SLA Google service; there's no contract for 100k
   conversations/month of usage, and Chrome-only means unknown mobile-browser
   coverage. *First thing I'd change:* move to a paid STT vendor (or hosted
   Whisper) with an actual SLA and usage-based billing I can forecast.
2. **Single-process, in-memory conversation state.** Right now
   `conversationState` lives in one browser tab / one Node process with no
   session store. At real concurrency this needs to move to a keyed store
   (Redis) per session, or the app can't horizontally scale past one
   instance — a second server instance would have no idea what slots a
   returning caller already stated.
3. **CSV-as-database.** `filterCatalog()` does a linear scan over the whole
   catalog on every turn. Fine at 136 rows; if the real catalog is
   tens of thousands of live listings updated continuously, this needs an
   actual indexed store (Postgres with indexes on price/body_type/fuel/city,
   or a search engine like Typesense/Elasticsearch for the ranking step) —
   not because of raw scale, but because "listing update" needs to be
   consistent while search is happening, which a flat file can't guarantee.
4. **TTS/STT vendor rate limits under concurrency**, not raw compute — most
   hosted STT/TTS vendors cap concurrent-stream count on a plan, not just
   monthly volume, so a burst of simultaneous callers (not just monthly
   average) is the more likely first outage, before compute or DB ever
   becomes the bottleneck.

I would *not* start with "add more servers" — the app logic itself
(`pipeline.js`) is cheap, synchronous, sub-millisecond per call (see eval
latency log); the bottlenecks are all at the I/O edges (STT/TTS vendor,
session state, catalog store), so that's where I'd spend the first
engineering budget.

## Q&A prep (from the assignment's shared question list)

- **"STT misheard Ace as S — what happens downstream?"** `extractSlots()`
  would find no body-type/fuel/city match in "S", so no new slot would be
  set, and the conversation state (from the prior turn) would carry forward
  unchanged. The failure is silent rather than loud — a real fix would add a
  confidence threshold from the STT result and prompt "sorry, didn't catch
  that" instead of silently keeping stale state.
- **"Why did you rank these three first — show me the reason in data."**
  `rankResults()` returns a `reasons` array per record (papers-verified,
  price-vs-budget headroom, km driven, model year) alongside a numeric
  `score` — the UI's "Reason:" line in each spoken answer is read straight
  from that array, not generated separately.
- **"Which component would you replace first in production?"** STT (see
  scale answer #1) — its interface is a single function boundary
  (`utterance: string`), so swapping Web Speech API for a hosted vendor
  touches exactly one call site in `index.html` and nothing in
  `pipeline.js`.
- **"Where does the latency go?"** See the live latency panel in the UI and
  `eval/run_eval.js`'s per-stage timestamps — the pipeline stages
  themselves are sub-millisecond; almost all real-world latency in this
  build is STT round-trip time to Google's recognition service, which isn't
  instrumented client-side beyond speech-end timestamp (browser doesn't
  expose STT-internal timing) — that's the "first 200ms" I'd go after with
  a streaming/partial-results STT integration instead of wait-for-final.

## Known limitations (stated up front, not discovered in Q&A)

- Lexicon-based NLU won't generalize past its keyword list — "compact
  hauler" won't be recognized as `mini_truck` without adding it.
- No noisy-audio handling; no streaming partial STT results (both are
  listed stretch goals I didn't pick).
- `answerFollowUp()`'s "uska" resolution always targets the #1-ranked
  result, not whichever vehicle the user last asked about specifically —
  fine for a single follow-up, would misfire on "tell me about the second
  one, actually never mind, what about its price" chains.
- The correction heuristic (`detectCorrection`) is keyword-triggered
  ("nahi", "not", "instead", ...); a correction phrased without any of
  those words would just look like a normal new-slot statement (which,
  functionally, still updates state correctly — it just isn't logged as a
  "correction").
