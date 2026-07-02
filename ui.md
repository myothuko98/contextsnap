# Contextify — UX Design Doc

**Designer:** TBD  
**Status:** Draft v0.1  
**Last updated:** 2026-06-21  

---

## 1. The design bet

We are betting that a **hyper-minimal terminal CLI interface** with a visual ASCII hierarchy and automatic clipboard-copy functionality is the lowest-friction experience for developers. Because developers live in the terminal and code editors, introducing a graphical browser UI or a complex configuration panel is a distraction. 

We are focusing 90% of our design effort on the typography and ANSI color layout of the printed CLI output. If the console output looks like a premium, hacker-green, structured tool rather than a messy error trace, developers will trust it and integrate it into their daily muscle memory.

## 2. The defining interaction

The core moment of magic is the transition from execution to clipboard ready:

> "User types `npx contextify src/utils` in their terminal and hits Enter. The CLI immediately clears the line. A retro-green loader animation (a rotating prompt `[ / ]`) shimmers for 400ms. Then, the CLI prints the ASCII folder tree diagram of files and exported functions. Finally, the terminal sounds a subtle system beep (bell control character `\x07`), the output text glows in vibrant retro-green, and a success footer with the copied tokens metric appears. The user can immediately press `Cmd+V` (or `Ctrl+V`) in their browser LLM. Total time: ~450ms. Feels like: clicking a satisfying physical mechanical keyboard switch."

## 3. Screen inventory

Because Contextify is a command-line tool, our "screens" are console states and output formats:

- **State 1: CLI Terminal Interface (Console Output)** — The primary console screen printed to the terminal upon execution, displaying the visual ASCII file tree and clipboard confirmation.
- **State 2: Fallback Context Document (`.ai-context.md`)** — The layout and structure of the generated markdown file, optimized for token-efficiency and LLM parsing readability.

---

## 4. Screen-by-screen specs

### State 1: CLI Terminal Interface (Console Output)

**Purpose:** Provide visual feedback of the scanned codebase structure and confirm that the context has been copied.

**Layout (top to bottom):**
1. **Brand Header:** The Contextify logo `[Contextify]` printed in bold, retro-green ANSI colors.
2. **Visual Directory Tree:** ASCII box-drawing lines representing the files scanned and a list of their exported functions.
3. **Success Block:** A checkmark icon (`✔`), a success message, and a telemetry-less calculation of saved tokens.
4. **Action Prompt:** A subtle instruction pointing to clipboard usage.

**Key interactions:**
- `npx contextify <path>` → Clears current terminal line, initiates scanning animation.
- Scanner complete → Play short system bell, render ASCII tree, copy to clipboard, and exit process.

**States:**
- **Default (Success):** Standard hacker-green tree with checkout info.
- **Empty / First-time:** Occurs when the directory contains no JS/TS files. Shows a yellow warning banner:  
  `⚠ [Contextify] No exportable functions found in path/to/folder. Fallback file not created.`
- **Loading:** Displays a cyclic rotating bar loader `[ \ ]` in green text next to the message: `scanning codebase structures...`
- **Error:** Triggered on invalid directory inputs or permission errors. Renders a red bold block:  
  `✘ Error: Directory 'src/wrong' does not exist.`
- **Edge / "too much":** If scanning more than 30 files, the console output truncates the tree to prevent cluttering the terminal history, showing:  
  `... and 15 more files (Tree truncated. Complete signatures written to .ai-context.md)`

---

### State 2: Fallback Context Document (`.ai-context.md`)

**Purpose:** Standardized markdown layout that serves as a persistent record of the extracted codebase context.

**Layout (top to bottom):**
1. **Metadata Header:** A commented block containing the scan date, target path, and version of Contextify.
2. **Markdown Sections (per file):**
   - File Path Header: `## File: src/utils/date.ts`
   - Code Block: Contains JSDoc block, function names, parameter signatures, and typescript return types (stripped of execution code).

**Example output:**

````markdown
# CONTEXTIFY CODEBASE CONTEXT (Generated 2026-06-21)
## File: src/utils/date.ts
```typescript
/**
 * Formats an ISO string to a human-readable local date.
 * @param isoString - The ISO date string to convert
 */
export function formatLocal(isoString: string): string;
```
---
````

## 5. The user journey

Jordan is working on a checkout form and needs to write an address-validation integration. Jordan knows the team has utility functions in `src/utils/` but doesn't know their names.

1. **Step 1 (Trigger):** Jordan opens their IDE's integrated terminal panel.
2. **Step 2 (Action):** Jordan types `npx contextify src/utils` and presses Enter.
3. **Step 3 (Feedback):** In less than 500ms, a green ASCII tree appears, listing `validation.ts (validateZip, validateEmail)` and `currency.ts (formatUSD)`. A system beep chimes, and the green footer flashes: `✔ Copied! (Saved 1,200 tokens)`.
4. **Step 4 (Magical Loop):** Jordan switches to their web browser (Claude.ai). They paste (`Cmd+V`) the context directly into the prompt box.
5. **Step 5 (Outcome):** Jordan types: *"Write a shipping form component that uses the zip validator from context."* The model returns code using the exact parameter types and names of `validateZip`.
6. **Step 6 (Second Session):** Two days later, Jordan is editing `currency.ts`. They run `npx contextify src/utils` again to update their clipboard before asking Claude to add a Euros format feature. The flow is now native muscle memory.

---

## 6. Component & visual notes

- **Typography:** Determined by the developer's terminal profile (e.g., Fira Code, Menlo, SF Mono).
- **Color (ANSI-Escaped):**
  - **Retro Green (`\x1b[32m`):** Success states, tree structures, checkmarks.
  - **Cyan (`\x1b[36m`):** File names and paths.
  - **Yellow (`\x1b[33m`):** Warnings and fallbacks.
  - **Red (`\x1b[31m`):** Error headers and code failures.
- **Motion (Console animation):** A 4-frame rotating spinner (`[ / ]`, `[ - ]`, `[ \ ]`, `[ | ]`) running at 100ms intervals during file scanning.
- **Microcopy Voice:** Technical, completely lowercase, no filler words. e.g., `writing fallback...`, `copied!`.

## 7. Accessibility & inclusion

- **Screen Readers:** Since we output standard ANSI terminal text, CLI logs are read cleanly by macOS VoiceOver and other screen readers. We avoid using emoji as structural layout elements, relying instead on clean ASCII characters (`├──`).
- **Low-Bandwidth:** The `.ai-context.md` utilizes a compressed text format that fits inside local copy buffers, generating zero network traffic.

## 8. What we are NOT designing

- **No Settings Menu:** All actions are passed via standard terminal arguments; we are not designing an interactive configuration prompt flow.
- **No GUI Windows:** No browser mockups, no tray app icon visual designs, and no popup notification overlays.
- **No Authentication Screens:** Since the tool is local, there are no log-in/sign-up forms.

## 9. Open design questions

- [ ] How should we handle terminal clients configured with a white background (light theme)? Green/cyan can have low contrast. (We'll use high-contrast bold variants `\x1b[1;32m` to maintain readability across light/dark themes).

## 10. Handoff to engineering

The CLI scanner and clipboard-copy performance must complete in less than 500ms end-to-end. Any latency beyond 1 second makes running the CLI feel like "homework" and kills the keyboard flow.
