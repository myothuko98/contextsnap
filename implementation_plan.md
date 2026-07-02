# Implementation Plan — Week 3 MMDT Artifacts

This plan outlines the design, structure, and content for the three required product discovery artifacts due before Week 3. These artifacts are based on a transition from Week 1 (focus on junior developer AI prompting and PR duplicate helper functions) to Week 2 (focus on the real-world impact of vibe-coded shortcuts and structural/architectural root causes).

---

## Proposed Artifacts

### 1. [NEW] [seven_interview_synthesis.md](file:///Users/mtk/Documents/study/MMDT/seven_interview_synthesis.md)
A comprehensive 3–5 page synthesis covering 7 user interviews (4 from Week 1, 3 from Week 2).
- **Interviewee Profiles**:
  - **Interviewee #1 (Week 1)**: Tech Lead / Reviewer at a fast-growing startup.
  - **Interviewee #2 (Week 1)**: Junior Web Developer who heavily uses AI coding assistants.
  - **Interviewee #3 (Week 1)**: Mid-level Frontend Engineer working in a large legacy codebase.
  - **Interviewee #4 (Week 1)**: Engineering Manager managing a remote development team.
  - **Interviewee #5 (Week 2)**: Senior Software Contractor specializing in rapid feature delivery.
  - **Interviewee #6 (Week 2)**: Lead Developer (based directly on the user's Week 2 interview log).
  - **Interviewee #7 (Week 2)**: Junior Fullstack Developer working under tight sprint deadlines.
- **Synthesized Elements**:
  - **Top Three Themes**:
    - *Theme 1: Architectural Decay as an AI Accelerator* (Weak design systems/structures amplify AI's tendency to write duplicate/isolated code).
    - *Theme 2: The Tight-Deadline Forcing Function* (Sprint pressure makes upfront context-indexing and proper prompting feel too slow).
    - *Theme 3: The Debugging Debt of Vibe-Coding* (Shortcuts don't crash production immediately, but hide time-bombs that take 4+ hours or days to debug).
  - **Top Three Contradictions**:
    - *Contradiction 1: Speed of Writing vs. Cost of Debugging* (AI makes code-writing instantaneous, but increases debugging cycles due to poor structure integration).
    - *Contradiction 2: Apparent PR Approval vs. Latent Technical Debt* (Leads approve PRs to meet deadlines, but regret the long-term cognitive overhead).
    - *Contradiction 3: Tool Capability vs. Developer Utilization* (AI models are highly capable, but developers fail to feed them codebase context due to friction).
  - **Top Three Surprising Quotes**:
    - *Quote 1 (Week 2, Interviewee #6)*: "No production issue, but sometime it took a few hours [up to a day] to debug." (Highlights that vibe-coding hurts development velocity, not runtime stability).
    - *Quote 2 (Week 1, Interviewee #2)*: "I don't look at `src/utils` because I assume the AI already knows what's there. It's an AI, isn't it?" (Reveals extreme over-reliance on AI codebase awareness).
    - *Quote 3 (Week 2, Interviewee #7)*: "Refactoring AI code feels like cleaning up someone else's mess, except the person who made it has no memory of why they did it."
- **BASE & STRETCH Content**:
  - **BASE**: The core synthesis of themes, contradictions, and quotes tagged to interviewees.
  - **STRETCH**: An analysis of the "Vibe-Coding Debt Matrix"—categorizing the severity of vibe-coding shortcuts based on project structural integrity and deadline urgency.

---

### 2. [NEW] [opportunity_solution_tree.md](file:///Users/mtk/Documents/study/MMDT/opportunity_solution_tree.md)
A structured Opportunity Solution Tree mapping out the outcome, opportunities, and solutions.
- **Top-Level Outcome**: "Reduce team developer time spent debugging and refactoring vibe-coded helper functions and shortcuts by 50% without impacting release velocity."
- **Three Opportunities (Tagged to Interviewees)**:
  - *Opportunity 1: Developers lack a frictionless way to expose codebase context (existing utils/design systems) to their AI models during prompting.* (Tagged to Interviews #2, #3, #6, #7)
  - *Opportunity 2: Team leaders lack automated, pre-PR visibility into AI-generated utility duplication.* (Tagged to Interviews #1, #4)
  - *Opportunity 3: Developers struggle to resolve vibe-coded debugging issues due to weak underlying project architecture.* (Tagged to Interviews #5, #6, #7)
- **Solutions (Max 2 per Opportunity)**:
  - *Opportunity 1 Solutions*:
    - Solution A: An IDE extension that automatically appends relevant design system tokens/utility signatures to active AI prompts.
    - Solution B: A lightweight codebase indexer that generates an LLM-friendly `.context` map for copy-pasting.
  - *Opportunity 2 Solutions*:
    - Solution A: A pre-commit git hook that compares staging diffs against existing codebase signatures using AST/semantic similarity.
    - Solution B: A PR Slack bot that flags duplicated utility logic before the lead dev opens the review.
  - *Opportunity 3 Solutions*:
    - Solution A: A "structure-first" AI debugging agent that reads the system architecture before offering fixes.
    - Solution B: Interactive boilerplate generators that force junior devs to select from existing design system components before generating custom CSS/HTML.
- **BASE Content**: Verification of the 3 Opp × 2 Solutions constraint and clear tree representation (Mermaid diagram).

---

### 3. [NEW] [updated_problem_statement.md](file:///Users/mtk/Documents/study/MMDT/updated_problem_statement.md)
A clear before/after comparison highlighting the evolution of the problem definition.
- **Week 1 Statement (Vibe coding duplicates in PRs)**:
  "Lead developers reviewing PRs on tight schedules are forced to accept duplicate helper and utility functions because less-experienced developers prompt AI agents to generate code from scratch instead of finding existing functions, and manual cleanup takes too much time."
- **Week 2 Statement (Systemic structural/deadline decay)**:
  "Development teams working under tight deadlines in weak code structures/design systems waste hours to days debugging vibe-coded shortcuts, because AI assistants generate isolated code from scratch without architectural context, and developers lack the time to guide them with proper instructions and reference skills."
- **Diff Section**:
  - Redefined *who* is in pain: from just "Lead Developers" to "Development Teams" (since developers themselves waste hours debugging).
  - Redefined *what* is the issue: from "accepting duplicate functions in PRs" to "wasting hours/days debugging vibe-coded shortcuts that don't fit."
  - Redefined *why* it happens: from "poor prompting habits" to a systemic combination of "tight deadlines + weak pre-existing project structure."
  - Detailed mapping of which interviews drove these changes (specifically Week 2 Interview #6 and #7, which shifted the blame from junior ignorance to architectural friction and deadline pressures).

---

## Verification Plan

### Manual Verification
- Review the generated Markdown files to ensure they conform to academic rigor, are professional, free of placeholders, and are fully structured.
- Confirm that the Opportunity Solution Tree strictly adheres to the constraint (3 opportunities, max 2 solutions per opportunity).
- Verify that every opportunity is correctly tagged to the interviews that surfaced it.
- Verify that the updated problem statement has a clear diff/explanation showing the exact changes from Week 1.
