import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { runCommand } from "./process.mjs";

function sha256(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function sessionKey(sessionId) {
  return String(sessionId || "default").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "default";
}

function baselinePath(stateDir, sessionId) {
  return path.join(stateDir, `turn-baseline-${sessionKey(sessionId)}.json`);
}

function captureWorkingTree(cwd) {
  const head = runCommand("git", ["rev-parse", "HEAD"], { cwd });
  const porcelain = runCommand("git", ["status", "--porcelain=v1", "-uall"], { cwd });
  const unstaged = runCommand("git", ["diff", "HEAD"], { cwd });
  const staged = runCommand("git", ["diff", "--cached"], { cwd });
  return {
    head: head.status === 0 ? head.stdout.trim() : "",
    porcelain: porcelain.status === 0 ? porcelain.stdout : "",
    unstagedHash: sha256(unstaged.status === 0 ? unstaged.stdout : ""),
    stagedHash: sha256(staged.status === 0 ? staged.stdout : ""),
    capturedAt: new Date().toISOString()
  };
}

export function saveTurnBaseline(cwd, stateDir, sessionId) {
  if (!stateDir) {
    return;
  }
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    baselinePath(stateDir, sessionId),
    `${JSON.stringify(captureWorkingTree(cwd), null, 2)}\n`,
    "utf8"
  );
}

function parsePorcelain(text) {
  return new Set(
    String(text ?? "")
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
  );
}

export function formatGitSnapshot(cwd, stateDir, sessionId) {
  const now = captureWorkingTree(cwd);
  const file = stateDir ? baselinePath(stateDir, sessionId) : null;
  let baseline = null;
  if (file && fs.existsSync(file)) {
    try {
      baseline = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      baseline = null;
    }
  }

  const lines = ["Turn-scoped repository snapshot:"];
  if (!baseline) {
    lines.push("No turn baseline. Falling back to the current dirty tree.");
    const status = runCommand("git", ["status", "--short", "--untracked-files=all"], { cwd });
    const statusText = status.status === 0 ? status.stdout.trim() : "";
    if (statusText) {
      lines.push("git status --short:", statusText);
    } else {
      lines.push("Working tree clean (no uncommitted changes).");
    }
    return lines.join("\n");
  }

  lines.push(`Baseline captured at ${baseline.capturedAt || "unknown"} (HEAD ${baseline.head || "?"}).`);
  const before = parsePorcelain(baseline.porcelain);
  const after = parsePorcelain(now.porcelain);
  const added = [...after].filter((line) => !before.has(line));
  const removed = [...before].filter((line) => !after.has(line));
  const contentChanged =
    baseline.unstagedHash !== now.unstagedHash || baseline.stagedHash !== now.stagedHash;
  let committedFiles = "";
  if (now.head && baseline.head && now.head !== baseline.head) {
    const names = runCommand("git", ["diff", "--name-only", `${baseline.head}..${now.head}`], { cwd });
    committedFiles = names.status === 0 ? names.stdout.trim() : "";
    lines.push(`HEAD moved ${baseline.head.slice(0, 7)} -> ${now.head.slice(0, 7)}.`);
    if (committedFiles) {
      lines.push("Files in commits since turn start:", committedFiles);
    }
  }

  if (contentChanged) {
    const stat = runCommand("git", ["diff", "--stat", "HEAD"], { cwd });
    lines.push("Working-tree content changed since turn start (includes further edits to already-dirty files).");
    if (stat.status === 0 && stat.stdout.trim()) {
      lines.push(stat.stdout.trim());
    }
  }
  if (added.length === 0 && removed.length === 0 && !committedFiles && !contentChanged) {
    lines.push("No working-tree or HEAD changes since the start of this turn.");
    return lines.join("\n");
  }
  if (added.length) {
    lines.push("Working-tree lines new since turn start:", added.join("\n"));
  }
  if (removed.length) {
    lines.push("Working-tree lines cleared since turn start:", removed.join("\n"));
  }
  return lines.join("\n");
}
