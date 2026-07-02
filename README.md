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
contextsnap [directory] [options]
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
| `--ignore=<pattern>` | Skip folders/files matching `<pattern>` — whole-name match, `*` wildcards supported (repeatable) |
| `-h, --help` | Show help with examples |

You can also put patterns in a `.contextsnapignore` file (one per line, `#` for comments).

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

# Use via npx without global install
npx contextsnap src/utils
```

---

## What it does

1. **Scans** the target directory recursively for `.js`, `.ts`, `.jsx`, `.tsx` files
2. **Extracts** exported function/const/class/interface signatures, `export default`, `export { ... }` lists, CommonJS `module.exports`, and JSDoc blocks
3. **Strips** implementation bodies — only the contract (name, params, return type) is kept
4. **Compiles** a token-optimized markdown file with reuse instructions for the AI and per-file import hints
5. **Copies** it to your clipboard automatically (`pbcopy` / `xclip` / `clip`)
6. **Prints** a retro-green ASCII tree of everything scanned

---

## Output format

The clipboard and `.ai-context.md` file look like this:

```markdown
# CONTEXTSNAP CODEBASE CONTEXT (Generated 2026-07-02)

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
export function formatLocal(isoString: string): string;

export const DEFAULT_LOCALE: string;
​```
```

This format is intentionally compact — it tells the LLM **what exists and what the contract is**, without wasting tokens on implementation details.

---

## How to use with an LLM

1. Run `contextsnap src/utils`
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
