#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import process from "node:process";

import { getGrokAuthStatus, getGrokAvailability } from "./lib/grok.mjs";
import { getConfig, setConfig } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const FALLBACK_STATE_ROOT = path.join(os.homedir(), ".codex", "plugins", "data", "grok-plugin-codex", "state");

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") {
      options.json = true;
    } else if (token === "--enable-review-gate") {
      options.enable = true;
    } else if (token === "--disable-review-gate") {
      options.disable = true;
    } else if (token === "--cwd") {
      options.cwd = argv[++i];
    }
  }
  return options;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "setup") {
    process.stderr.write("Usage: node companion.mjs setup [--enable-review-gate|--disable-review-gate] [--json]\n");
    process.exitCode = 1;
    return;
  }

  const options = parseArgs(rest);
  if (options.enable && options.disable) {
    throw new Error("Choose either --enable-review-gate or --disable-review-gate.");
  }

  const cwd = resolveWorkspaceRoot(options.cwd || process.cwd());
  const actionsTaken = [];
  if (options.enable) {
    setConfig(cwd, FALLBACK_STATE_ROOT, "stopReviewGate", true);
    actionsTaken.push(`Enabled the Grok stop-time review gate for ${cwd}.`);
  } else if (options.disable) {
    setConfig(cwd, FALLBACK_STATE_ROOT, "stopReviewGate", false);
    actionsTaken.push(`Disabled the Grok stop-time review gate for ${cwd}.`);
  }

  const grok = getGrokAvailability(cwd);
  const auth = getGrokAuthStatus();
  const config = getConfig(cwd, FALLBACK_STATE_ROOT);
  const nextSteps = [];
  if (!grok.available) {
    nextSteps.push("Install Grok Build so `grok` is on PATH, or set GROK_BIN.");
  }
  if (grok.available && !auth.loggedIn) {
    nextSteps.push("Run `grok login`.");
  }
  if (!config.stopReviewGate) {
    nextSteps.push("Run `$grok:setup --enable-review-gate` to require a Grok review before Codex can stop.");
  }

  const report = {
    ready: grok.available && auth.loggedIn,
    grok,
    auth,
    reviewGateEnabled: Boolean(config.stopReviewGate),
    actionsTaken,
    nextSteps
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const lines = [
    "# Grok setup for Codex",
    "",
    `Status: ${report.ready ? "ready" : "needs attention"}`,
    "",
    "Checks:",
    `- grok: ${grok.detail}`,
    `- auth: ${auth.detail}`,
    `- review gate: ${report.reviewGateEnabled ? "enabled" : "disabled"}`,
    ""
  ];
  if (actionsTaken.length) {
    lines.push("Actions taken:");
    for (const action of actionsTaken) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }
  if (nextSteps.length) {
    lines.push("Next steps:");
    for (const step of nextSteps) {
      lines.push(`- ${step}`);
    }
  }
  process.stdout.write(`${lines.join("\n").trimEnd()}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
