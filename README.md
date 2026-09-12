# Grok plugin for Codex

When Codex tries to stop, Grok reviews that turn and can block it.

This is the reverse of [krushit/grok-plugin-cc](https://github.com/krushit/grok-plugin-cc): that plugin uses Grok as a stop gate inside Claude Code. This plugin uses Grok as a stop gate inside Codex.

The Claude equivalent is [krushit/claude-plugin-codex](https://github.com/krushit/claude-plugin-codex).

## Requirements

- Node.js 18.18+
- Codex CLI with plugins/hooks enabled
- `grok` on PATH (or `GROK_BIN`), signed in (`grok login`)

## Install

```bash
codex plugin marketplace add krushit/grok-plugin-codex
codex plugin add grok@grok-plugin-codex
```

Codex will ask you to **trust** the plugin's Stop hook before it runs. Trust is required; installing is not enough.

Then, in a Codex session:

```text
$grok:setup --enable-review-gate
```

Disable with `$grok:setup --disable-review-gate`. The setting is per workspace.

## What the gate does

On `Stop`, Grok runs a read-only review of the previous Codex turn.

- `ALLOW` — Codex stops
- `BLOCK` — Codex continues; the reason is injected as the next prompt

Status, setup, and review-only turns should `ALLOW` immediately.

> The gate can loop and burn usage. Only enable it when you are watching the session.
