#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { saveTurnBaseline } from "./lib/git.mjs";
import { resolveStateDir } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const FALLBACK_STATE_ROOT = path.join(os.homedir(), ".codex", "plugins", "data", "grok-plugin-codex", "state");

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

try {
  const input = readHookInput();
  const cwd = resolveWorkspaceRoot(
    input.cwd || input.workspaceRoot || process.env.CODEX_HOME_CWD || process.cwd()
  );
  saveTurnBaseline(cwd, resolveStateDir(cwd, FALLBACK_STATE_ROOT));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}
