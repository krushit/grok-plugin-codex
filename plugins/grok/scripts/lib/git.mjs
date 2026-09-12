import { runCommand } from "./process.mjs";

export function formatGitSnapshot(cwd) {
  const status = runCommand("git", ["status", "--short", "--untracked-files=all"], { cwd });
  const unstaged = runCommand("git", ["diff", "--stat", "HEAD"], { cwd });
  const staged = runCommand("git", ["diff", "--stat", "--cached"], { cwd });
  const recent = runCommand("git", ["log", "-5", "--oneline"], { cwd });

  const statusText = status.status === 0 ? status.stdout.trim() : "";
  const unstagedText = unstaged.status === 0 ? unstaged.stdout.trim() : "";
  const stagedText = staged.status === 0 ? staged.stdout.trim() : "";
  const recentText = recent.status === 0 ? recent.stdout.trim() : "";
  const clean = !statusText && !unstagedText && !stagedText;

  const lines = [
    "Repository snapshot (current working tree — not a guaranteed this-turn diff):"
  ];
  if (clean) {
    lines.push("Working tree clean (no uncommitted changes).");
  } else {
    if (statusText) {
      lines.push("git status --short:", statusText);
    }
    if (stagedText) {
      lines.push("staged diff --stat:", stagedText);
    }
    if (unstagedText) {
      lines.push("unstaged diff --stat:", unstagedText);
    }
  }
  if (recentText) {
    lines.push("recent commits:", recentText);
  }
  return lines.join("\n");
}
