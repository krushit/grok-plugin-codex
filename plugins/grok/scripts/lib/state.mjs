import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

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

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function withStateLock(dir, fn) {
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, "state.lock");
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (error) {
      if (error.code === "EEXIST") {
        try {
          const owner = Number(fs.readFileSync(lock, "utf8").trim());
          if (owner && !pidAlive(owner)) {
            fs.unlinkSync(lock);
            continue;
          }
        } catch {
          // retry until deadline
        }
      }
      if (error.code !== "EEXIST" || Date.now() > deadline) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    try {
      fs.unlinkSync(lock);
    } catch {
      // ignore
    }
  }
}

export function saveState(cwd, fallbackRoot, state) {
  const dir = resolveStateDir(cwd, fallbackRoot);
  return withStateLock(dir, () => {
    const next = {
      version: STATE_VERSION,
      config: { ...defaultState().config, ...(state.config ?? {}) }
    };
    const filePath = path.join(dir, STATE_FILE_NAME);
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, filePath);
    return next;
  });
}

export function getConfig(cwd, fallbackRoot) {
  return loadState(cwd, fallbackRoot).config;
}

export function setConfig(cwd, fallbackRoot, key, value) {
  const state = loadState(cwd, fallbackRoot);
  state.config = { ...state.config, [key]: value };
  return saveState(cwd, fallbackRoot, state);
}
