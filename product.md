# Contextify — Product Design Doc

**Author:** PM  
**Status:** Draft v0.1  
**Last updated:** 2026-06-21  
**One-liner:** Generate a token-optimized context snapshot of your utility functions and design tokens and copy it to your clipboard with a single command.

---

## 1. The user & the moment

- **Who:** Jordan, a junior-to-mid-level developer working in a fast-paced team on a large codebase. They are fluent in writing basic code but rely on browser LLMs (like Claude, ChatGPT, or Gemini) to write complex logic or integrate helper utilities.
- **When:** It's 4:00 PM on a Tuesday. Jordan is under pressure to complete a checkout integration before the daily release. They need to write a date-parsing function that aligns with the team's existing date utilities, but they don't know what utilities are already in `src/utils/`.
- **Why now:** Copy-pasting ten utility files manually is tedious, wastes token budget, and causes cognitive fatigue. If Jordan prompts the AI assistant without context, the LLM generates a duplicate function from scratch, leading to code bloat and hours of debugging when it breaks timezone checks.

## 2. The contract (I/O)

- **Input:** A terminal command specifying a target directory (e.g., `npx contextify src/utils`).
- **Output:** A single, token-optimized `.ai-context.md` file generated in the workspace root, which is simultaneously copied to the system clipboard.
- **The loop:** Run CLI command → Context copied automatically → Paste into LLM chat → Receive context-aligned, correct code back.

## 3. The magical moment

The single sentence the user would say to a friend after using this for the first time:

> "I ran `npx contextify`, pasted it into Claude, and it wrote a perfect checkout integration on the first try without me copy-pasting ten utility files."

## 4. Scope: what we ARE building (v1)

- A standalone terminal command executable via `npx` or local binary (`npx contextify <path>`).
- A recursive scanner that parses JavaScript and TypeScript files in the target directory.
- A token-optimizing compiler that strips out function bodies, local comments, and imports, leaving only JSDocs, function signatures, export statements, and variable types.
- System clipboard copy integration that silently copies the compiled markdown to the clipboard upon success.
- A retro-green ASCII visual tree map of all exported functions and files printed in the terminal console.
- A local `.ai-context.md` file generated in the workspace root as a fallback.

## 5. Scope: what we are NOT building

- **No automated code refactoring** — The tool is strictly read-only; it will never edit or refactor existing code.
- **No complex AST/semantic matching** — We will not run heavy semantic comparison engines; we rely on simple regex or TypeScript compiler APIs to extract signatures.
- **No background watch daemon** — The CLI must be run manually; there is no background file monitoring or editor extension integration in v1.
- **No custom configuration files** — The CLI uses smart defaults; no custom ignore lists, JSON outputs, or custom headers in v1.
- **No cloud storage or user sync** — Device-local execution only; no authentication, accounts, or history databases.

## 6. The signature detail

The console output features a beautiful, vintage retro-green ASCII-tree diagram representing the utility hierarchy, with a microcopy footer saying: 

```text
  [Contextify] ──────────────────────────────────────────
  ├── date.ts (parseISO, formatLocal, diffDays)
  ├── currency.ts (formatUSD, getExchangeRate)
  └── theme.ts (colors, breakpoints)
  ───────────────────────────────────────────────────────
  ✔ Copied to clipboard! (Saved 1,420 token cycles)
```

The tree is styled using ANSI escape codes to render a vibrant, hacker-green terminal aesthetic. If the clipboard copy fails, the tool displays a yellow warning box with fallback copy instructions.

## 7. Success: how we know it worked

- **Primary:** ≥60% of developers who run `contextify` once run it at least 3 times in the next 7 days.
- **Secondary:** CLI execution from command trigger to clipboard copy finishes in under 800ms.
- **What we're NOT measuring:** Total package downloads or global installations (meaningless without repeat usage).

## 8. Open questions

- [ ] Will system clipboard commands (like `pbcopy` on macOS, `xclip` on Linux, and PowerShell on Windows) execute reliably without external node-module dependencies?
- [ ] Can we extract TypeScript types accurately from nested namespaces using a light RegExp parser, or must we load a TypeScript compiler service?

## 9. Handoff

- **For UX:** The terminal ASCII-tree must feel extremely crisp and look perfectly aligned regardless of folder depth or length of exported signatures.
- **For Eng:** Clipboard copy operations must be completely silent and fail gracefully without crashing the CLI if clipboard access is denied.
