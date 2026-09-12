import test from "node:test";
import assert from "node:assert/strict";

import { parseHeadlessJson, parseStopDecision } from "../plugins/grok/scripts/lib/parse.mjs";

test("parseStopDecision accepts structured ALLOW and BLOCK", () => {
  assert.equal(parseStopDecision({ structured: { decision: "ALLOW", reason: "clean" } }).ok, true);
  assert.equal(parseStopDecision({ structured: { decision: "BLOCK", reason: "bug" } }).ok, false);
  assert.equal(parseStopDecision({ text: "ALLOW: nothing to review" }).ok, true);
  assert.equal(parseStopDecision({ text: "BLOCK: missing test" }).ok, false);
});

test("parseHeadlessJson reads Claude result JSON and Grok text JSON", () => {
  const claude = parseHeadlessJson(JSON.stringify({ result: '{"decision":"ALLOW","reason":"ok"}' }));
  assert.equal(claude.structured.decision, "ALLOW");
  const grok = parseHeadlessJson(JSON.stringify({ text: '{"decision":"BLOCK","reason":"bug"}' }));
  assert.equal(grok.structured.decision, "BLOCK");
});
