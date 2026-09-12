import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 1;
const PLUGIN_DATA_ENVS = ["PLUGIN_DATA", "CLAUDE_PLUGIN_DATA"];
const STATE_FILE_NAME = "state.json";

function defaultState() {
  return {
    version: STATE_VERSION,
    config: {
      stopReviewGate: false
    }
  };
}

function pluginDataDir() {
  for (const name of PLUGIN_DATA_ENVS) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return null;
}

export function resolveStateDir(cwd, fallbackRoot) {
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
  const dataDir = pluginDataDir();
  const stateRoot = dataDir ? path.join(dataDir, "state") : fallbackRoot;
  return path.join(stateRoot, `${slug}-${hash}`);
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
