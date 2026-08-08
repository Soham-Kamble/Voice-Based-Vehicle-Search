/**
 * Vyngo Voice Search — Core Pipeline
 * ----------------------------------
 * Components 3, 4, 5, 6 from the assignment live here as pure, synchronous,
 * dependency-free functions so that:
 *   (a) the browser UI can call them after STT, and
 *   (b) the eval harness (Node) can call the EXACT same code — not a mock —
 *       against text utterances.
 *
 * This file intentionally contains ZERO calls to any LLM for the response
 * stage. That is the anti-hallucination mechanism: the spoken answer is
 * template-built by pulling fields directly off catalog record objects.
 * There is no free-text generation step between "record" and "sentence",
 * so there is no channel through which an invented number could appear.
 * (Slot *extraction* is rule-based too, for the same reason — see README
 * for the tradeoff vs. LLM function-calling.)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VyngoPipeline = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  // ---------------------------------------------------------------------
  // 3. UNDERSTANDING STAGE — intent + slot extraction
  // ---------------------------------------------------------------------

  const BODY_TYPE_LEXICON = {
    mini_truck: ["chhota truck", "mini truck", "chota truck", "ace", "jeeto", "small truck", "chhota", "mini-truck"],
    pickup: ["pickup truck", "pickup", "pick up", "pick-up"],
    truck: ["truck", "bada truck", "big truck", "large truck"],
  };

  // Vehicle types buyers might ask for that this catalog simply does not
  // carry (it's a used COMMERCIAL vehicle marketplace, per the assignment
  // spec — mini-trucks/pickups/trucks only, no passenger cars). Recognizing
  // these explicitly means we can say "we don't have that" instead of
  // silently ignoring the word and falling back to whatever body_type was
  // already in conversation state, which would otherwise look like a bug
  // (asking for an SUV and getting a truck back).
  const OUT_OF_DOMAIN_BODY_TYPES = {
    suv: ["suv"],
    sedan: ["sedan"],
    hatchback: ["hatchback"],
    car: ["car", "passenger car"],
    bus: ["bus"],
    van: ["van", "minivan"],
  };

  const FUEL_LEXICON = {
    diesel: ["diesel"],
    petrol: ["petrol", "gasoline"],
    cng: ["cng"],
    electric: ["electric", "ev"],
  };

  const CITY_LEXICON = [
    "Mumbai", "Pune", "Navi Mumbai", "Thane", "Nashik", "Nagpur",
    "Delhi", "Gurgaon", "Noida", "Ahmedabad", "Surat", "Bangalore",
    "Chennai", "Hyderabad", "Kolkata", "Jaipur", "Lucknow", "Indore",
  ];

  const PURPOSE_LEXICON = {
    city_delivery: ["city delivery", "shehar", "local delivery", "andar shehar"],
    last_mile: ["last mile", "last-mile"],
    long_haul: ["long haul", "long-haul", "highway", "outstation"],
    intercity: ["intercity", "inter city", "do shehar"],
    construction: ["construction", "material transport", "sand", "cement"],
  };

  // "5 lakh", "5.5 lakh", "500000", "5,00,000" -> rupees (number)
  function parseMoneyToRupees(text) {
    const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*lakh/i);
    if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100000);
    const crMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/i);
    if (crMatch) return Math.round(parseFloat(crMatch[1]) * 10000000);
    const plain = text.match(/(?:rs\.?|₹)?\s*(\d[\d,]{4,})/i);
    if (plain) return parseInt(plain[1].replace(/,/g, ""), 10);
    return null;
  }

  // Picks the RIGHTMOST matching phrase in the utterance, not the first.
  // This is what makes correction utterances work: "nahi diesel nahi, cng
  // chahiye" mentions both "diesel" and "cng" — the one stated LAST is the
  // one the speaker means, exactly like a human listener would resolve it.
  //
  // Two-pass: first collect every (key, start, end) span that matches.
  // Drop any span that is wholly contained inside a LONGER matched span
  // (e.g. plain "truck" occurring inside "mini truck" shouldn't out-rank
  // "mini truck" itself). Then take the rightmost surviving span.
  function collectSpans(text, entries) {
    const t = text.toLowerCase();
    const spans = [];
    for (const [key, phrase] of entries) {
      const p = phrase.toLowerCase();
      let from = 0;
      let idx;
      while ((idx = t.indexOf(p, from)) !== -1) {
        spans.push({ key, start: idx, end: idx + p.length, len: p.length });
        from = idx + 1;
      }
    }
    const survivors = spans.filter((s) =>
      !spans.some((o) => o !== s && o.len > s.len && o.start <= s.start && o.end >= s.end)
    );
    survivors.sort((a, b) => a.start - b.start);
    return survivors.length ? survivors[survivors.length - 1].key : null;
  }

  function findLexiconMatch(text, lexicon) {
    const entries = [];
    for (const [key, phrases] of Object.entries(lexicon)) {
      for (const phrase of phrases) entries.push([key, phrase]);
    }
    return collectSpans(text, entries);
  }

  function findCity(text) {
    return collectSpans(text, CITY_LEXICON.map((c) => [c, c]));
  }

  // Correction pattern: "nahi diesel nahi, cng chahiye" / "not diesel, cng"
  // General shape: "nahi <old> nahi, <new>" or "not <old>, <new>" or "<new> chahiye, <old> nahi"
  function detectCorrection(text) {
    const t = text.toLowerCase();
    const correctionTriggers = ["nahi", "not", "galat", "wrong", "change", "instead", "badlo"];
    return correctionTriggers.some((w) => t.includes(w));
  }

  /**
   * Extracts slots present in this utterance only (does NOT merge with
   * previous state — that merge is the caller's job, in updateState()).
   * Returns { slots: {...}, isCorrection: bool, isFollowUp: bool, raw: text }
   */
  function extractSlots(utterance) {
    const text = utterance.trim();
    const slots = {};

    const budget = parseMoneyToRupees(text);
    if (budget !== null) slots.budget_max = budget;

    const bodyType = findLexiconMatch(text, BODY_TYPE_LEXICON);
    if (bodyType) slots.body_type = bodyType;

    const outOfDomain = findLexiconMatch(text, OUT_OF_DOMAIN_BODY_TYPES);
    const outOfDomainRequest = (!bodyType && outOfDomain) ? outOfDomain : null;

    const fuel = findLexiconMatch(text, FUEL_LEXICON);
    if (fuel) slots.fuel = fuel;

    const city = findCity(text);
    if (city) slots.city = city;

    const purpose = findLexiconMatch(text, PURPOSE_LEXICON);
    if (purpose) slots.purpose = purpose;

    const isCorrection = detectCorrection(text);
    const isFollowUp = /\buska\b|\buski\b|\bwoh\b|\bthat one\b|\bit\b|\b(price|km|year|papers|fuel)\b.*\?/i.test(text)
      && Object.keys(slots).length === 0; // pure follow-up carries no new catalog slots

    return { slots, isCorrection, isFollowUp, outOfDomainRequest, raw: text };
  }

  /**
   * Merges newly-extracted slots into existing conversation state.
   * A correction REPLACES only the slots present in the new utterance —
   * every other slot in state is left untouched. This satisfies the
   * "update one slot, don't restart" requirement.
   */
  function updateState(prevState, extraction) {
    const state = Object.assign({}, prevState);
    for (const [k, v] of Object.entries(extraction.slots)) {
      state[k] = v; // overwrite only the slot(s) mentioned this turn
    }
    return state;
  }

  // ---------------------------------------------------------------------
  // 4. CATALOG + SEARCH LAYER
  // ---------------------------------------------------------------------

  function parseCatalogCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const headers = lines[0].split(",");
    return lines.slice(1).map((line) => {
      const cells = line.split(",");
      const rec = {};
      headers.forEach((h, i) => (rec[h] = cells[i]));
      rec.year = parseInt(rec.year, 10);
      rec.price = parseInt(rec.price, 10);
      rec.km_driven = parseInt(rec.km_driven, 10);
      rec.payload_kg = parseInt(rec.payload_kg, 10);
      rec.gvw_kg = parseInt(rec.gvw_kg, 10);
      rec.papers_verified = rec.papers_verified === "yes";
      return rec;
    });
  }

  /** Converts slot state into HARD filters — a stated constraint is a wall. */
  function filterCatalog(catalog, slots) {
    return catalog.filter((r) => {
      if (slots.budget_max != null && r.price > slots.budget_max) return false;
      if (slots.body_type && r.body_type !== slots.body_type) return false;
      if (slots.fuel && r.fuel !== slots.fuel) return false;
      if (slots.city && r.city !== slots.city) return false;
      return true;
    });
  }

  /**
   * Ranks remaining candidates. Explainable: score is visible per record.
   * `reasons` is built so the FIRST reason is whatever most concretely
   * distinguishes this record — budget fit or low mileage — not a fixed
   * "papers verified" every time. Papers-verified is real signal (+score)
   * but only surfaces as the *lead* reason when it's the standout fact
   * (i.e. this record is verified and that's rarer among the candidates).
   */
  function rankResults(records, slots) {
    const verifiedCount = records.filter((r) => r.papers_verified).length;
    const papersAreDifferentiator = verifiedCount > 0 && verifiedCount < records.length;

    const scored = records.map((r) => {
      let score = 0;
      if (r.papers_verified) score += 3;
      let budgetHeadroom = null;
      if (slots.budget_max != null) {
        budgetHeadroom = slots.budget_max - r.price;
        score += Math.max(0, 2 - budgetHeadroom / 100000);
      }
      score += Math.max(0, 2 - r.km_driven / 100000); // lower km = better
      score += (r.year - 2015) * 0.1; // newer = slightly better
      return { record: r, score, budgetHeadroom };
    });

    // Rank first (score order), THEN build reasons using the ranked set so
    // "lowest km among these 3" etc. is computed relative to what's actually
    // being shown, not the whole catalog.
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(3, scored.length));
    const minKm = top.length ? Math.min(...top.map((s) => s.record.km_driven)) : null;
    const maxYear = top.length ? Math.max(...top.map((s) => s.record.year)) : null;

    for (const s of scored) {
      const r = s.record;
      const reasons = [];

      // Concrete, comparative reasons first.
      if (top.includes(s) && r.km_driven === minKm) {
        reasons.push(`lowest mileage of the top matches (${r.km_driven.toLocaleString("en-IN")} km)`);
      }
      if (top.includes(s) && r.year === maxYear) {
        reasons.push(`newest model year shown (${r.year})`);
      }
      if (s.budgetHeadroom != null && s.budgetHeadroom >= 0) {
        reasons.push(`₹${s.budgetHeadroom.toLocaleString("en-IN")} under your budget`);
      }
      if (r.papers_verified && (papersAreDifferentiator || reasons.length === 0)) {
        reasons.push("papers verified");
      }
      if (reasons.length === 0) {
        // fallback so we never show an empty reason list
        reasons.push(`${r.km_driven.toLocaleString("en-IN")} km, ${r.year} model`);
      }
      s.reasons = reasons;
    }

    return scored;
  }

  /** If zero results, suggest a concrete, deterministic relaxation. */
  function suggestRelaxation(catalog, slots) {
    const attempts = [];
    if (slots.budget_max != null) {
      const relaxedBudget = Math.round(slots.budget_max * 1.2);
      const relaxed = filterCatalog(catalog, Object.assign({}, slots, { budget_max: relaxedBudget }));
      if (relaxed.length > 0) {
        attempts.push({
          change: `raising budget to ₹${relaxedBudget.toLocaleString("en-IN")}`,
          count: relaxed.length,
        });
      }
    }
    if (slots.city) {
      const relaxed = filterCatalog(catalog, Object.assign({}, slots, { city: undefined }));
      if (relaxed.length > 0) {
        attempts.push({ change: `searching outside ${slots.city}`, count: relaxed.length });
      }
    }
    if (slots.fuel) {
      const relaxed = filterCatalog(catalog, Object.assign({}, slots, { fuel: undefined }));
      if (relaxed.length > 0) {
        attempts.push({ change: `allowing any fuel type`, count: relaxed.length });
      }
    }
    return attempts[0] || null;
  }

  // ---------------------------------------------------------------------
  // 5. RESPONSE LAYER — grounded, template-only composition (no LLM)
  // ---------------------------------------------------------------------

  function describeRecord(r) {
    return `${r.year} ${r.make} ${r.model}, ₹${r.price.toLocaleString("en-IN")}, ` +
      `${r.km_driven.toLocaleString("en-IN")} km, ${r.fuel}, in ${r.city}` +
      `${r.papers_verified ? ", papers verified" : ", papers not verified"}`;
  }

  function composeAnswer(rankedResults, slots, catalog, outOfDomainRequest) {
    if (outOfDomainRequest) {
      return {
        text: `We only deal in used commercial vehicles — mini trucks, pickups, and trucks. ` +
              `We don't carry ${outOfDomainRequest}s. Want me to search one of those instead?`,
        topRecords: [],
      };
    }
    if (rankedResults.length === 0) {
      const suggestion = suggestRelaxation(catalog, slots);
      if (suggestion) {
        return {
          text: `No vehicles match those exact filters. If you're open to ${suggestion.change}, ` +
                `there are ${suggestion.count} option${suggestion.count === 1 ? "" : "s"} available. Want me to show those?`,
          topRecords: [],
        };
      }
      return { text: `No vehicles match those filters, and I couldn't find a nearby relaxation either. Try changing budget, city, or body type.`, topRecords: [] };
    }

    const top3 = rankedResults.slice(0, 3);
    const lines = top3.map((r, i) => {
      const reasonStr = r.reasons.slice(0, 2).join(", ");
      return `Option ${i + 1}: ${describeRecord(r.record)}. Reason: ${reasonStr}.`;
    });
    return {
      text: `I found ${rankedResults.length} matching vehicles. Here are the top ${top3.length}. ` + lines.join(" "),
      topRecords: top3.map((r) => r.record),
    };
  }

  /** Answers a follow-up question strictly from the last shown record set. */
  function answerFollowUp(utterance, lastRecords) {
    if (!lastRecords || lastRecords.length === 0) {
      return "I don't have a vehicle in context yet — search first.";
    }
    const target = lastRecords[0]; // "uska" defaults to the top-ranked result
    const t = utterance.toLowerCase();
    if (t.includes("price") || t.includes("kitna")) {
      return `The ${target.make} ${target.model} is priced at ₹${target.price.toLocaleString("en-IN")}.`;
    }
    if (t.includes("km")) {
      return `It has done ${target.km_driven.toLocaleString("en-IN")} km.`;
    }
    if (t.includes("year")) {
      return `It's a ${target.year} model.`;
    }
    if (t.includes("papers")) {
      return `Papers are ${target.papers_verified ? "verified" : "not verified"}.`;
    }
    if (t.includes("fuel")) {
      return `It runs on ${target.fuel}.`;
    }
    if (t.includes("payload") || t.includes("load") || t.includes("gvw") || t.includes("weight")) {
      return `It can carry a payload of ${target.payload_kg.toLocaleString("en-IN")} kg, with a GVW of ${target.gvw_kg.toLocaleString("en-IN")} kg.`;
    }
    return `The ${target.make} ${target.model}: ${describeRecord(target)}.`;
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  return {
    extractSlots,
    updateState,
    parseCatalogCSV,
    filterCatalog,
    rankResults,
    suggestRelaxation,
    composeAnswer,
    answerFollowUp,
    describeRecord,
    // exposed for eval/testing
    parseMoneyToRupees,
  };
});
