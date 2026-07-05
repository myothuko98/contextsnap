# Contextsnap

> Generate a token-optimized context snapshot of your codebase utilities and copy it to your clipboard — in one command.

[![npm version](https://img.shields.io/npm/v/contextsnap)](https://www.npmjs.com/package/contextsnap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## The Problem

When you vibe-code with an LLM (Claude, ChatGPT, Gemini), you paste a prompt and it writes a helper function **from scratch** — even though your codebase already has one in `src/utils/`. The result: duplicate code, subtle bugs, and hours of debugging.

## The Fix

Run `contextsnap` against your utilities folder. It scans your exports, strips implementation bodies, and copies a **token-optimized** context snapshot straight to your clipboard. Paste it into your LLM and get code that actually reuses what you already have.

```
  [Contextsnap] ─────────────────────────────────────────
  ├── date.ts (parseISO, formatLocal, diffDays)
  ├── currency.ts (formatUSD, getExchangeRate)
  └── theme.ts (colors, breakpoints)
  ───────────────────────────────────────────────────────
  ✔ Copied to clipboard! (~1,420 tokens)
```

---

## Install

### Use without installing (recommended)
```bash
npx contextsnap src/utils
```

### Install globally
```bash
npm install -g contextsnap
contextsnap src/utils
```

---

## Usage

```bash
contextsnap [directory ...] [options]
```

### Arguments

| Argument | Description |
|---|---|
| `[directory ...]` | One or more folders to scan (e.g. `src/utils src/hooks`). If omitted, contextsnap auto-detects the first of: `src/utils`, `src/lib`, `src/helpers`, `utils`, `lib`, `src` |

### Options

| Flag | Description |
|---|---|
| `--clipboard-only` | Skip writing `.ai-context.md` to disk; clipboard only |
| `--stdout` | Print markdown to stdout for piping (no clipboard, no file) |
| `--watch` | Re-run automatically on every file change. Press Ctrl+C to stop |
| `--format=<fmt>` | Output format: `markdown` (default) or `json` |
| `--ignore=<pattern>` | Skip folders/files matching `<pattern>` — whole-name match, `*` wildcards supported (repeatable) |
| `--inject[=<file>]` | Write the snapshot between `<!-- contextsnap:start/end -->` markers in `CLAUDE.md` / `AGENTS.md` (or `<file>`) — every AI session picks it up automatically |
| `--check` | Exit 1 if the committed snapshot (`.ai-context.md`, or the injected block with `--inject`) is stale — use in CI like a lint step |
| `--mcp` | Start an MCP stdio server for Claude Desktop / Claude Code / Cursor |
| `-h, --help` | Show help with examples |

You can also set persistent defaults in a `.contextsnaprc.json` file (see [Config file](#config-file)).

You can also put ignore patterns in a `.contextsnapignore` file (one per line, `#` for comments).

### Examples

```bash
# Zero-config: auto-detect your utils folder
contextsnap

# Scan utils folder, copy to clipboard, save .ai-context.md
contextsnap src/utils

# Scan entire src directory, clipboard only
contextsnap src --clipboard-only

# Scan multiple folders at once
contextsnap src/utils src/hooks

# Skip test files and mocks
contextsnap src --ignore=__tests__ --ignore=*.mock.*

# Pipe or redirect the markdown anywhere
contextsnap src --stdout > context.md

# Live refresh — re-runs every time you save a file
contextsnap src/utils --watch

# Machine-readable JSON output
contextsnap src/utils --format=json --stdout | jq '.files[].path'

# Start MCP server (used by Claude Desktop / Claude Code / Cursor)
contextsnap --mcp

# Use via npx without global install
npx contextsnap src/utils
```

---

## MCP Server Mode

**The easiest way to use contextsnap** — your AI gets codebase context automatically, no copy-paste needed.

`contextsnap --mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) stdio server. Claude Desktop, Claude Code, and Cursor can call it as a tool directly.

### Setup: Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "contextsnap": {
      "command": "contextsnap",
      "args": ["--mcp"]
    }
  }
}
```

Restart Claude Desktop. The `get_context` tool will appear. Just ask:

> *"What utility functions does this project already have?"*

and Claude will call `get_context` automatically to scan your codebase.

### Setup: Cursor / other MCP-compatible tools

```json
{
  "mcpServers": {
    "contextsnap": {
      "command": "npx",
      "args": ["contextsnap", "--mcp"]
    }
  }
}
```

### MCP Tools

**`get_context`** — full snapshot of every export.

| Parameter | Type | Description |
|---|---|---|
| `dirs` | `string[]` (optional) | Directories to scan. Defaults to auto-detect. |
| `ignore` | `string[]` (optional) | Patterns to skip (e.g. `["__tests__", "*.mock.*"]`) |

**`search_exports`** — find an export by name, signature, or JSDoc substring. Returns `file:line` locations so the agent can jump straight to a definition. Use before writing a new utility to check whether one already exists.

| Parameter | Type | Description |
|---|---|---|
| `query` | `string` | Case-insensitive substring to match |
| `dirs`, `ignore` | optional | Same as `get_context` |

**`get_file_context`** — signatures, line numbers, and JSDoc for a single file. Much cheaper than `get_context` when the agent already knows the file.

| Parameter | Type | Description |
|---|---|---|
| `path` | `string` | File path relative to cwd |

---

## Inject Mode — context in CLAUDE.md, zero paste

`contextsnap src --inject` writes the snapshot between markers in your `CLAUDE.md` (or `AGENTS.md` — auto-detected, or any file via `--inject=<file>`):

```markdown
# My project rules          ← your content, never touched

<!-- contextsnap:start -->
# CONTEXTSNAP CODEBASE CONTEXT …
<!-- contextsnap:end -->
```

Every Claude Code / agent session loads it automatically — no clipboard, no MCP setup. Re-running replaces only the marker block; idempotent. Combine with `--watch` to keep it fresh on every save. Set `"inject": true` (or a filename) in `.contextsnaprc.json` to make it the default.

---

## Check Mode — CI drift guard

`contextsnap src --check` regenerates the snapshot in memory and compares it against the committed one (`.ai-context.md`, or the injected block when combined with `--inject`). Generation dates are ignored; exit 1 on drift:

```yaml
# .github/workflows/context.yml
- run: npx contextsnap src --check   # fails the build when the snapshot is stale
```

---

## Watch Mode

`contextsnap src/utils --watch` runs the pipeline once immediately, then re-runs whenever any `.js/.ts/.jsx/.tsx` file changes. Your `.ai-context.md` stays fresh automatically.

```bash
contextsnap src/utils --watch
# [Contextsnap] ✔ Copied to clipboard! (~1,420 tokens)
# ℹ Watch mode active — re-running on file changes. Press Ctrl+C to stop.
# [Contextsnap] Refreshed at 2:34:07 PM
# [Contextsnap] Refreshed at 2:41:22 PM
```

Works on macOS, Windows, and Linux (Node ≥18).

---

## Config file

Create `.contextsnaprc.json` in your project root to set persistent defaults. CLI flags always override.

```json
{
  "dirs": ["src/utils", "src/hooks"],
  "ignore": ["__tests__", "*.mock.*"],
  "format": "markdown",
  "clipboardOnly": false
}
```

| Key | Type | Description |
|---|---|---|
| `dirs` | `string[]` | Default directories to scan |
| `ignore` | `string[]` | Default ignore patterns |
| `format` | `"markdown"` \| `"json"` | Output format |
| `clipboardOnly` | `boolean` | Don't write `.ai-context.md` |
| `stdout` | `boolean` | Print to stdout |

---

## GitHub Action

Auto-commit `.ai-context.md` on every push so your team always has a fresh snapshot:

```yaml
# .github/workflows/context.yml
name: Update context snapshot
on: [push]
jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: myothuko98/contextsnap@v2
        with:
          dirs: 'src/utils src/hooks'
          ignore: '__tests__'
      - run: |
          git config user.name "contextsnap-bot"
          git config user.email "bot@users.noreply.github.com"
          git add .ai-context.md
          git diff --staged --quiet || git commit -m "chore: update context snapshot [skip ci]"
          git push
```

### Action inputs

| Input | Description |
|---|---|
| `dirs` | Space-separated directories to scan |
| `ignore` | Space-separated ignore patterns |

### Action outputs

| Output | Description |
|---|---|
| `context-file` | Path to the generated file (always `.ai-context.md`) |
| `token-estimate` | Approximate token count |

---

## What it does

1. **Scans** the target directory recursively for `.js`, `.ts`, `.jsx`, `.tsx` files
2. **Extracts** exported function/const/let/var/class/interface/type/enum signatures, `export default` (declarations and expressions), `export { ... }` / `export type { ... }` lists, `export * [as ns] from`, CommonJS `module.exports`, and JSDoc blocks
3. **Strips** implementation bodies — only the contract (name, params, return type) is kept
4. **Validates** extraction against [es-module-lexer](https://github.com/guybedford/es-module-lexer): any ESM export the fast parser misses is still emitted as a name-only stub, with a warning — so the context never silently omits an export
5. **Compiles** a token-optimized markdown file with reuse instructions for the AI and per-file import hints
6. **Copies** it to your clipboard automatically (`pbcopy` / `xclip` / `clip`)
7. **Prints** a retro-green ASCII tree of everything scanned

### Known limitations

- TypeScript generics with inline object constraints (`function f<T extends { a: string }>()`) may truncate the signature at the `{`.
- Decorators are not included in extracted signatures.
- The es-module-lexer validation pass is best-effort on TypeScript files (it is a JS ESM lexer); it fully covers `.js`/`.mjs`/`.jsx`.

---

## Output format

The clipboard and `.ai-context.md` file look like this:

```markdown
# CONTEXTSNAP CODEBASE CONTEXT (Generated 2026-07-03)

> **Instructions for the AI assistant:** The utilities below ALREADY EXIST
> in this project. When writing code, import and reuse them instead of
> re-implementing anything.

## File: date.ts
​```typescript
// import from './date'

/**
 * Formats an ISO string to a human-readable local date.
 * @param isoString - The ISO date string to convert
 */
export function formatLocal(isoString: string): string; // :12

export const DEFAULT_LOCALE: string; // :4
​```
```

Use `--format=json` for structured output:

```json
{
  "generated": "2026-07-03",
  "stack": ["react", "zod"],
  "files": [
    {
      "path": "date.ts",
      "importFrom": "./date",
      "exports": [
        { "name": "formatLocal", "type": "function", "signature": "export function formatLocal(isoString: string): string;", "line": 12 }
      ]
    }
  ]
}
```

---

## How to use with an LLM (manual mode)

1. Run `contextsnap src/utils`
2. Open your LLM (Claude, ChatGPT, Gemini, etc.)
3. Press `Cmd+V` / `Ctrl+V` to paste the context
4. Write your prompt: *"Write a checkout form component using the zip validator from context."*
5. Get code that actually uses your existing utilities

Or use [MCP mode](#mcp-server-mode) and skip steps 1–3 entirely.

---

## Platform support

| Platform | Clipboard command |
|---|---|
| macOS | `pbcopy` |
| Linux | `xclip` or `xsel` |
| Windows | `clip` |

If clipboard copy fails, the tool warns you and falls back to `.ai-context.md`.

---

## Development

```bash
git clone https://github.com/myothuko98/contextsnap.git
cd contextsnap
npm install
npm test
```

Tests use [Vitest](https://vitest.dev/).

---

## Scope limits

- Ignores `node_modules`, `.git`, and hidden files automatically
- Exits with a warning if the target folder contains >300 files (narrow your path)
- Read-only — never modifies your source files

---

## License

[MIT](LICENSE) © 2026 myothuko98
