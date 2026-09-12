import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { binaryAvailable, runCommand, which } from "./process.mjs";
import { parseHeadlessJson } from "./parse.mjs";

const GROK_HOME = process.env.GROK_HOME || path.join(os.homedir(), ".grok");
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const REVIEW_TOOLS_DENY = ["search_replace", "web_search", "web_fetch", "Agent"].join(",");

export function resolveGrokBinary() {
  if (process.env.GROK_BIN) {
    return process.env.GROK_BIN;
  }
  const homeBin = path.join(GROK_HOME, "bin", "grok");
  if (fs.existsSync(homeBin)) {
    return homeBin;
  }
  return which("grok");
}

export function getGrokAvailability(cwd) {
  const binary = resolveGrokBinary();
  if (!binary) {
    return {
      available: false,
      binary: null,
      detail: "grok CLI not found. Install Grok Build, or set GROK_BIN."
    };
  }
  const version = binaryAvailable(binary, ["--version"], { cwd });
  if (!version.available) {
    return {
      available: false,
      binary,
      detail: `grok found at ${binary} but --version failed: ${version.detail}`
    };
  }
  return { available: true, binary, detail: version.detail };
}

function hasUsableSecret(value, depth = 0) {
  if (depth > 6 || value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length >= 12;
  }
  if (typeof value === "object") {
    return Object.values(value).some((entry) => hasUsableSecret(entry, depth + 1));
  }
  return false;
}

export function getGrokAuthStatus() {
  const authFile = path.join(GROK_HOME, "auth.json");
  if (!fs.existsSync(authFile)) {
    return { loggedIn: false, detail: "not signed in (no ~/.grok/auth.json). Run `grok login`." };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(authFile, "utf8"));
    if (!hasUsableSecret(parsed)) {
      return { loggedIn: false, detail: "auth.json has no usable credentials. Run `grok login`." };
    }
    return { loggedIn: true, detail: "signed in" };
  } catch {
    return { loggedIn: false, detail: "auth.json is unreadable. Run `grok login`." };
  }
}

export function runGrokReview({ cwd, prompt, schemaJson, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const availability = getGrokAvailability(cwd);
  if (!availability.available) {
    throw new Error(availability.detail);
  }

  const promptFile = path.join(os.tmpdir(), `codex-grok-gate-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, prompt, "utf8");
  try {
    const args = [
      "--prompt-file",
      promptFile,
      "--output-format",
      "json",
      "--json-schema",
      schemaJson,
      "--sandbox",
      "read-only",
      "--always-approve",
      "--disallowed-tools",
      REVIEW_TOOLS_DENY,
      "--max-turns",
      "25",
      "--verbatim",
      "--cwd",
      cwd
    ];
    const result = runCommand(availability.binary, args, {
      cwd,
      timeout: timeoutMs,
      env: { ...process.env, GROK_AGENT_DASHBOARD: "0" }
    });
    if (result.error?.code === "ETIMEDOUT") {
      throw new Error(`Grok timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    if (result.error) {
      throw new Error(result.error.message);
    }
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "").trim();
      throw new Error(detail || `Grok exited ${result.status}`);
    }
    return parseHeadlessJson(result.stdout);
  } finally {
    try {
      fs.unlinkSync(promptFile);
    } catch {
      // ignore
    }
  }
}
