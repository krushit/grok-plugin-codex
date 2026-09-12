import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 1;
const STATE_FILE_NAME = "state.json";
const STABLE_STATE_ROOT = path.join(os.homedir(), ".codex", "plugins", "data", "grok-plugin-codex", "state");

function defaultState() {
  return {
    version: STATE_VERSION,
    config: {
      stopReviewGate: false
    }
  };
}

function workspaceKey(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonical = workspaceRoot;
  try {
    canonical = fs.realpathSync.native(workspaceRoot);
  } catch {
    canonical = workspaceRoot;
  }
  const slugSource = path.basename(workspaceRoot) || "workspace";
  const slug = slugSource.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `${slug}-${hash}`;
}

function copyIfMissing(fromFile, toFile) {
  if (!fromFile || fromFile === toFile || !fs.existsSync(fromFile) || fs.existsSync(toFile)) {
    return false;
  }
  fs.mkdirSync(path.dirname(toFile), { recursive: true });
  fs.copyFileSync(fromFile, toFile);
  return true;
}

function migrateLegacyState(cwd, fallbackRoot) {
  const key = workspaceKey(cwd);
  const destFile = path.join(STABLE_STATE_ROOT, key, STATE_FILE_NAME);
  if (fs.existsSync(destFile)) {
    return;
  }
  const ownMarker = "grok-plugin-codex";
  const candidates = [];
  if (fallbackRoot) {
    candidates.push(path.join(fallbackRoot, key, STATE_FILE_NAME));
  }
  for (const name of ["PLUGIN_DATA", "CLAUDE_PLUGIN_DATA", "GROK_PLUGIN_DATA"]) {
    if (process.env[name] && String(process.env[name]).includes(ownMarker)) {
      candidates.push(path.join(process.env[name], "state", key, STATE_FILE_NAME));
    }
  }
  for (const candidate of candidates) {
    if (copyIfMissing(candidate, destFile)) {
      return;
    }
  }
}

export function resolveStateDir(cwd, fallbackRoot = STABLE_STATE_ROOT) {
  migrateLegacyState(cwd, fallbackRoot);
  return path.join(STABLE_STATE_ROOT, workspaceKey(cwd));
}

export function loadState(cwd, fallbackRoot) {
  const filePath = path.join(resolveStateDir(cwd, fallbackRoot), STATE_FILE_NAME);
  if (!fs.existsSync(filePath)) {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      ...defaultState(),
      ...parsed,
      config: { ...defaultState().config, ...(parsed.config ?? {}) }
    };
  } catch {
    return defaultState();
  }
}

export function saveState(cwd, fallbackRoot, state) {
  const dir = resolveStateDir(cwd, fallbackRoot);
  fs.mkdirSync(dir, { recursive: true });
  const next = {
    version: STATE_VERSION,
    config: { ...defaultState().config, ...(state.config ?? {}) }
  };
  fs.writeFileSync(path.join(dir, STATE_FILE_NAME), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function getConfig(cwd, fallbackRoot) {
  return loadState(cwd, fallbackRoot).config;
}

export function setConfig(cwd, fallbackRoot, key, value) {
  const state = loadState(cwd, fallbackRoot);
  state.config = { ...state.config, [key]: value };
  return saveState(cwd, fallbackRoot, state);
}
