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

function porcelainPath(line) {
  if (!line || line.length < 4) {
    return "";
  }
  const rest = line.slice(3);
  if (rest.includes(" -> ")) {
    return rest.split(" -> ").pop();
  }
  return rest.replace(/\/$/, "");
}

function hashPath(cwd, rel) {
  const abs = path.join(cwd, rel);
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) {
      return sha256(`symlink:${fs.readlinkSync(abs)}`);
    }
    if (st.isFile()) {
      return sha256(fs.readFileSync(abs));
    }
    if (st.isDirectory()) {
      const names = fs.readdirSync(abs).sort().join("\n");
      return sha256(`dir:${names}`);
    }
  } catch {
    return "";
  }
  return "";
}

function fileHashes(cwd, porcelain) {
  const hashes = {};
  for (const line of String(porcelain ?? "")
    .split(/\r?\n/)
    .filter(Boolean)) {
    const rel = porcelainPath(line);
    if (!rel) {
      continue;
    }
    hashes[rel] = hashPath(cwd, rel);
  }
  return hashes;
}

function captureWorkingTree(cwd) {
  const head = runCommand("git", ["rev-parse", "HEAD"], { cwd });
  const porcelain = runCommand("git", ["status", "--porcelain=v1", "-uall"], { cwd });
  const porcelainText = porcelain.status === 0 ? porcelain.stdout : "";
  return {
    head: head.status === 0 ? head.stdout.trim() : "",
    porcelain: porcelainText,
    files: fileHashes(cwd, porcelainText),
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
  const beforeFiles = baseline.files && typeof baseline.files === "object" ? baseline.files : {};
  const afterFiles = now.files || {};
  const names = new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)]);
  const changed = [...names].filter((rel) => beforeFiles[rel] !== afterFiles[rel]).sort();
  let committedFiles = "";
  if (now.head && baseline.head && now.head !== baseline.head) {
    const committed = runCommand("git", ["diff", "--name-only", `${baseline.head}..${now.head}`], { cwd });
    committedFiles = committed.status === 0 ? committed.stdout.trim() : "";
    lines.push(`HEAD moved ${baseline.head.slice(0, 7)} -> ${now.head.slice(0, 7)}.`);
    if (committedFiles) {
      lines.push("Files in commits since turn start:", committedFiles);
    }
  }

  if (changed.length === 0 && !committedFiles) {
    lines.push("No working-tree or HEAD changes since the start of this turn.");
    return lines.join("\n");
  }
  if (changed.length) {
    lines.push("Paths whose contents changed since turn start (includes untracked files):", changed.join("\n"));
    const tracked = changed.filter((rel) => fs.existsSync(path.join(cwd, rel)));
    if (tracked.length) {
      const stat = runCommand("git", ["diff", "--stat", "HEAD", "--", ...tracked], { cwd });
      if (stat.status === 0 && stat.stdout.trim()) {
        lines.push(stat.stdout.trim());
      }
    }
  }
  return lines.join("\n");
}
