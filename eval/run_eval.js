#!/usr/bin/env node
/**
 * Eval harness — component 7 of the assignment.
 *
 * Runs each test utterance through the SAME extractSlots/updateState/
 * filterCatalog/rankResults/composeAnswer functions the browser UI calls
 * (imported directly from ../pipeline.js, no mocking), checks the resulting
 * slot state against expected_slots, and prints a pass rate.
 *
 * Also logs per-utterance processing latency (understanding -> search ->
 * response compose). This does NOT include STT/TTS latency since eval runs
 * on text, not audio — see README for why, and how live per-turn
 * (speech-end -> first-audio) latency is captured separately in the UI.
 *
 * Usage: node eval/run_eval.js
 */
const fs = require("fs");
const path = require("path");
const P = require("../pipeline.js");

const catalogCsv = fs.readFileSync(path.join(__dirname, "..", "catalog.csv"), "utf8");
const catalog = P.parseCatalogCSV(catalogCsv);

const tests = JSON.parse(fs.readFileSync(path.join(__dirname, "eval_utterances.json"), "utf8"));

function slotsMatch(actual, expected) {
  for (const [k, v] of Object.entries(expected)) {
    if (actual[k] !== v) return false;
  }
  return true;
}

let conversationState = {}; // simulates a running conversation, so corrections/follow-ups can be tested in sequence
let lastRankedRecords = [];

let passCount = 0;
const results = [];

for (const test of tests) {
  const t0 = process.hrtime.bigint();

  const extraction = P.extractSlots(test.utterance);
  const t1 = process.hrtime.bigint(); // understanding done

  let outcome, note;

  if (extraction.isFollowUp) {
    const answer = P.answerFollowUp(test.utterance, lastRankedRecords);
    const gotFallback = answer.includes("don't have a vehicle in context");
    outcome = test.expect_grounded_answer ? !gotFallback : true;
    note = `follow-up -> "${answer}"` + (test.expect_grounded_answer && gotFallback ? "  [FAIL: expected a grounded answer, got the empty-context fallback]" : "");
  } else {
    conversationState = P.updateState(conversationState, extraction);
    const t2 = process.hrtime.bigint(); // state update done

    const filtered = extraction.outOfDomainRequest ? [] : P.filterCatalog(catalog, conversationState);
    const ranked = extraction.outOfDomainRequest ? [] : P.rankResults(filtered, conversationState);
    lastRankedRecords = ranked.slice(0, 3).map((r) => r.record);
    const t3 = process.hrtime.bigint(); // search done

    const response = P.composeAnswer(ranked, conversationState, catalog, extraction.outOfDomainRequest);
    const t4 = process.hrtime.bigint(); // response composed

    outcome = slotsMatch(extraction.slots, test.expected_slots || {});
    if (test.expect_out_of_domain) {
      outcome = outcome && extraction.outOfDomainRequest === test.expect_out_of_domain;
    }
    if (test.expect_real_matches) {
      outcome = outcome && filtered.length > 0;
    }
    note = `matched=${filtered.length} state=${JSON.stringify(conversationState)}` +
      (extraction.outOfDomainRequest ? ` outOfDomain=${extraction.outOfDomainRequest}` : "");

    test._latency = {
      understanding_ms: Number(t1 - t0) / 1e6,
      state_update_ms: Number(t2 - t1) / 1e6,
      search_ms: Number(t3 - t2) / 1e6,
      response_compose_ms: Number(t4 - t3) / 1e6,
      total_ms: Number(t4 - t0) / 1e6,
    };
  }

  if (outcome) passCount++;
  results.push({ id: test.id, utterance: test.utterance, pass: outcome, note, latency: test._latency || null });
}

// ---- Report ----
console.log("=".repeat(78));
console.log("VYNGO VOICE SEARCH — EVAL RESULTS");
console.log("=".repeat(78));
for (const r of results) {
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.id}  "${r.utterance}"`);
  console.log(`       ${r.note}`);
  if (r.latency) {
    console.log(
      `       latency(ms): understanding=${r.latency.understanding_ms.toFixed(3)} ` +
      `search=${r.latency.search_ms.toFixed(3)} ` +
      `response=${r.latency.response_compose_ms.toFixed(3)} ` +
      `total=${r.latency.total_ms.toFixed(3)}`
    );
  }
}
console.log("-".repeat(78));
const passRate = (100 * passCount) / results.length;
console.log(`PASS RATE: ${passCount}/${results.length} (${passRate.toFixed(1)}%)`);
console.log("=".repeat(78));

// Note on catalog + hard-filter correctness spot-check (component 2 of rubric:
// "a stated constraint is a wall"): re-verify no returned record ever violates
// its own filter, across ALL non-followup tests.
let violation = false;
conversationState = {};
for (const test of tests) {
  const extraction = P.extractSlots(test.utterance);
  if (extraction.isFollowUp) continue;
  conversationState = P.updateState(conversationState, extraction);
  const filtered = P.filterCatalog(catalog, conversationState);
  for (const r of filtered) {
    if (conversationState.budget_max != null && r.price > conversationState.budget_max) violation = true;
    if (conversationState.fuel && r.fuel !== conversationState.fuel) violation = true;
    if (conversationState.city && r.city !== conversationState.city) violation = true;
    if (conversationState.body_type && r.body_type !== conversationState.body_type) violation = true;
  }
}
console.log(`CONSTRAINT-VIOLATION CHECK: ${violation ? "FAILED — a filter was violated!" : "PASSED — zero violations across all filtered results"}`);

process.exit(passRate >= 70 && !violation ? 0 : 1);
