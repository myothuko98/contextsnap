# Contextify

> Generate a token-optimized context snapshot of your codebase utilities and copy it to your clipboard — in one command.

[![npm version](https://img.shields.io/npm/v/contextify-cli)](https://www.npmjs.com/package/contextify-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## The Problem

When you vibe-code with an LLM (Claude, ChatGPT, Gemini), you paste a prompt and it writes a helper function **from scratch** — even though your codebase already has one in `src/utils/`. The result: duplicate code, subtle bugs, and hours of debugging.

## The Fix

Run `contextify` against your utilities folder. It scans your exports, strips implementation bodies, and copies a **token-optimized** context snapshot straight to your clipboard. Paste it into your LLM and get code that actually reuses what you already have.

```
  [Contextify] ──────────────────────────────────────────
  ├── date.ts (parseISO, formatLocal, diffDays)
  ├── currency.ts (formatUSD, getExchangeRate)
  └── theme.ts (colors, breakpoints)
  ───────────────────────────────────────────────────────
  ✔ Copied to clipboard! (Saved ~1,420 token cycles)
```

---

## Install

### Use without installing (recommended)
```bash
npx contextify-cli src/utils
```

### Install globally
```bash
npm install -g contextify-cli
contextify src/utils
```

---

## Usage

```bash
contextify <directory> [options]
```

### Arguments

| Argument | Description |
|---|---|
| `<directory>` | Path to the folder you want to scan (e.g. `src/utils`) |

### Options

| Flag | Description |
|---|---|
| `--no-file` | Skip writing `.ai-context.md` to disk; clipboard only |

### Examples

```bash
# Scan utils folder, copy to clipboard, save .ai-context.md
contextify src/utils

# Scan entire src directory, clipboard only
contextify src --no-file

# Use via npx without global install
npx contextify-cli src/utils
```

---

## What it does

1. **Scans** the target directory recursively for `.js`, `.ts`, `.jsx`, `.tsx` files
2. **Extracts** exported function/const/class/interface signatures and JSDoc blocks
3. **Strips** implementation bodies — only the contract (name, params, return type) is kept
4. **Compiles** a token-optimized markdown file
5. **Copies** it to your clipboard automatically (`pbcopy` / `xclip` / `clip`)
6. **Prints** a retro-green ASCII tree of everything scanned

---

## Output format

The clipboard and `.ai-context.md` file look like this:

```markdown
# CONTEXTIFY CODEBASE CONTEXT (Generated 2026-07-01)

## File: date.ts
​```typescript
/**
 * Formats an ISO string to a human-readable local date.
 * @param isoString - The ISO date string to convert
 */
export function formatLocal(isoString: string): string;

export const DEFAULT_LOCALE: string;
​```
```

This format is intentionally compact — it tells the LLM **what exists and what the contract is**, without wasting tokens on implementation details.

---

## How to use with an LLM

1. Run `contextify src/utils`
2. Open your LLM (Claude, ChatGPT, Gemini, etc.)
3. Press `Cmd+V` / `Ctrl+V` to paste the context
4. Write your prompt: *"Write a checkout form component using the zip validator from context."*
5. Get code that actually uses your existing utilities

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
git clone https://github.com/myothuko98/contextify.git
cd contextify
npm install
npm test
```

Tests use [Vitest](https://vitest.dev/). All 16 tests pass.

---

## Scope limits

- Ignores `node_modules`, `.git`, and hidden files automatically
- Exits with a warning if the target folder contains >300 files (narrow your path)
- Read-only — never modifies your source files

---

## License

[MIT](LICENSE) © 2026 myothuko98
