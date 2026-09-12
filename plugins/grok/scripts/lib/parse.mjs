export function parseStopDecision(result) {
  const structured = result?.structured;
  if (structured && typeof structured.decision === "string") {
    const decision = structured.decision.trim().toUpperCase();
    const reason = String(structured.reason ?? "").trim();
    if (decision === "ALLOW") {
      return { ok: true, reason: reason || "Review allowed the turn." };
    }
    if (decision === "BLOCK") {
      return { ok: false, reason: reason || "Review blocked the turn." };
    }
  }

  const text = String(result?.text ?? "").trim();
  const firstLine = text.split(/\r?\n/, 1)[0].trim();
  if (firstLine.startsWith("ALLOW:")) {
    return { ok: true, reason: firstLine.slice("ALLOW:".length).trim() || "Review allowed the turn." };
  }
  if (firstLine.startsWith("BLOCK:")) {
    return { ok: false, reason: firstLine.slice("BLOCK:".length).trim() || "Review blocked the turn." };
  }

  return {
    ok: false,
    reason: "Stop-time review returned an unexpected answer. Bypass the gate or rerun setup."
  };
}

export function parseHeadlessJson(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) {
    return { structured: null, text: "" };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { structured: null, text };
  }

  if (parsed?.type === "error") {
    throw new Error(parsed.message || "Reviewer returned an error object.");
  }

  const structured =
    parsed?.structured_output && typeof parsed.structured_output === "object"
      ? parsed.structured_output
      : null;
  const body = String(parsed?.result ?? parsed?.text ?? "").trim();

  if (structured) {
    return { structured, text: body || JSON.stringify(structured) };
  }
  if (body) {
    try {
      return { structured: JSON.parse(body), text: body };
    } catch {
      return { structured: null, text: body };
    }
  }
  if (parsed && typeof parsed === "object" && (parsed.decision || parsed.verdict)) {
    return { structured: parsed, text };
  }
  return { structured: null, text: body || text };
}
