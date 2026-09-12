import fs from "node:fs";
import path from "node:path";

import { runCommand } from "./process.mjs";

const BASELINE_FILE = "turn-baseline.json";

function captureWorkingTree(cwd) {
  const head = runCommand("git", ["rev-parse", "HEAD"], { cwd });
  const porcelain = runCommand("git", ["status", "--porcelain=v1", "-uall"], { cwd });
  return {
    head: head.status === 0 ? head.stdout.trim() : "",
    porcelain: porcelain.status === 0 ? porcelain.stdout : "",
    capturedAt: new Date().toISOString()
  };
}

export function saveTurnBaseline(cwd, stateDir) {
  if (!stateDir) {
    return;
  }
  fs.mkdirSync(stateDir, { recursive: true });
  const payload = captureWorkingTree(cwd);
  fs.writeFileSync(path.join(stateDir, BASELINE_FILE), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parsePorcelain(text) {
  return new Set(
    String(text ?? "")
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
  );
}

export function formatGitSnapshot(cwd, stateDir) {
  const now = captureWorkingTree(cwd);
  const baselineFile = stateDir ? path.join(stateDir, BASELINE_FILE) : null;
  let baseline = null;
  if (baselineFile && fs.existsSync(baselineFile)) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
    } catch {
      baseline = null;
    }
  }

  const lines = ["Turn-scoped repository snapshot:"];
  if (!baseline) {
    lines.push(
      "No turn baseline (UserPromptSubmit hook did not run). Falling back to the current dirty tree."
    );
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
  let committedFiles = "";
  if (now.head && baseline.head && now.head !== baseline.head) {
    const names = runCommand("git", ["diff", "--name-only", `${baseline.head}..${now.head}`], { cwd });
    committedFiles = names.status === 0 ? names.stdout.trim() : "";
    lines.push(`HEAD moved ${baseline.head.slice(0, 7)} -> ${now.head.slice(0, 7)}.`);
    if (committedFiles) {
      lines.push("Files in commits since turn start:", committedFiles);
    }
  }

  if (added.length === 0 && removed.length === 0 && !committedFiles) {
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
