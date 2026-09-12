#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getGrokAvailability, runGrokReview } from "./lib/grok.mjs";
import { parseStopDecision } from "./lib/parse.mjs";
import { interpolateTemplate, loadJsonSchema, loadPromptTemplate } from "./lib/prompts.mjs";
import { getConfig } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const STOP_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_MESSAGE_CHARS = 24_000;
const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const FALLBACK_STATE_ROOT = path.join(os.homedir(), ".codex", "plugins", "data", "grok-plugin-codex", "state");

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function logNote(message) {
  if (message) {
    process.stderr.write(`${message}\n`);
  }
}

function truncate(text, maxChars) {
  const value = String(text ?? "");
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n\n[truncated]`;
}

function main() {
  const input = readHookInput();
  const cwd = resolveWorkspaceRoot(input.cwd || process.cwd());
  const config = getConfig(cwd, FALLBACK_STATE_ROOT);

  if (!config.stopReviewGate) {
    emit({});
    return;
  }

  const availability = getGrokAvailability(cwd);
  if (!availability.available) {
    logNote(`Grok is not set up for the review gate. ${availability.detail} Run $grok:setup.`);
    emit({});
    return;
  }

  const lastMessage = truncate(input.last_assistant_message ?? "", MAX_MESSAGE_CHARS);
  const prompt = interpolateTemplate(loadPromptTemplate(ROOT_DIR, "stop-review-gate"), {
    CODEX_RESPONSE_BLOCK: lastMessage ? `Previous Codex response:\n${lastMessage}` : ""
  });

  let result;
  try {
    result = runGrokReview({
      cwd,
      prompt,
      schemaJson: loadJsonSchema(ROOT_DIR, "stop-decision.schema"),
      timeoutMs: STOP_REVIEW_TIMEOUT_MS
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({
      decision: "block",
      reason: `The Grok stop-time review failed: ${message} Run $grok:setup or bypass the gate.`
    });
    return;
  }

  const review = parseStopDecision(result);
  if (!review.ok) {
    emit({
      decision: "block",
      reason: `Grok stop-time review found issues that still need fixes before ending the session: ${review.reason}`
    });
    return;
  }

  emit({});
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  emit({
    decision: "block",
    reason: `The Grok stop-time review hook crashed: ${message}`
  });
}
