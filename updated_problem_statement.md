# Updated Problem Statement — Week 1 to Week 2/3 Evolution

**Status:** Completed  
**Last updated:** 2026-06-21  
**Scope:** MMDT Course Artifact (Week 2 -> Week 3 transition)

---

## 1. Problem Statement Comparison

Below is the evolution of the problem statement. Week 1 focused on PR duplication as a lead developer bottleneck. Week 2/3 shifts the focus to developer debugging time-sinks caused by systemic architectural weaknesses and tight deadlines.

### Week 1 Problem Statement (Initial Hypothesis)
> *"Lead developers reviewing PRs on tight schedules are forced to accept duplicate helper and utility functions because less-experienced developers prompt AI agents to generate code from scratch instead of finding existing functions, and manual cleanup takes too much time."*

### Week 2/3 Problem Statement (Refined Hypothesis)
> *"Development teams working under tight deadlines in weak code structures/design systems waste hours to days debugging vibe-coded shortcuts, because AI assistants generate isolated code from scratch without architectural context, and developers lack the time to guide them with proper instructions and reference skills."*

---

## 2. Git-Style Diff

This git-style diff visually highlights the structural changes, showing the deletion of the narrow PR-focused framing and the addition of the broader systemic, debugging, and architectural framing.

```diff
-Lead developers reviewing PRs on tight schedules are forced to accept duplicate helper and utility functions 
-because less-experienced developers prompt AI agents to generate code from scratch instead of finding existing functions, 
-and manual cleanup takes too much time.
+Development teams working under tight deadlines in weak code structures/design systems waste hours to days 
+debugging vibe-coded shortcuts, because AI assistants generate isolated code from scratch without 
+architectural context, and developers lack the time to guide them with proper instructions and reference skills.
```

---

## 3. Narrative of What Changed, Why, and Which Interviews Drove It

The transition between Week 1 and Week 2 represents a significant pivot in our understanding of both **the pain point** and **the root cause**.

### 1. What Changed (Reframing the Pain and Persona)
*   **The Persona Expanded:** In Week 1, we believed the primary victim of vibe-coding was the **Lead Developer (Alex)** who suffered during PR reviews. In Week 2, we discovered that the pain is felt across the **entire development team** (including juniors, mid-levels, and contractors) who spend hours stuck in debugging loops.
*   **The Pain Shifted from Code Duplication to Debugging Velocity:** Initially, we focused on "duplicate helper functions in PRs." Interviews revealed that duplicates are considered a "minor inconvenience" and rarely cause production outages. However, the real pain is the **time-sink of debugging vibe-coded shortcuts**. When AI-generated code breaks, it takes hours or a day to fix. This is a direct hit to team velocity.

### 2. Why It Changed (Reframing the Root Cause)
*   **From "Poor Prompting" to "Systemic Structural Weakness":** In Week 1, we blamed the developer's "poor prompting habits" and "inexperience." Week 2 interviews revealed a systemic circular dependency:
    1.  The team works under **tight deadlines**.
    2.  The existing codebase has a **weak structure or weak design system**.
    3.  Because of the weak structure, developers cannot easily reference existing patterns, forcing them to use AI to generate new code from scratch (vibe-coding).
    4.  Because the AI has no architectural context or guardrails, it generates disjointed code.
    5.  When this disjointed code breaks, it takes a day to debug, further shrinking the timeline and forcing more vibe-coding.

### 3. Which Interviews Drove the Shift
*   **Interview #6 (Lead Developer):** This was the primary driver of the pivot. When asked when vibe-coding caused a real problem, they noted there were no production issues, but it regularly took *a few hours to a day to debug*. Crucially, they stated: *"if they don’t have weak structure or weak design system, it takes a few hours. sometime it took a day."* This proved that debugging complexity is a function of codebase architecture, not just AI performance.
*   **Interview #7 (Junior Developer):** Confirmed that sprint pressure (*"tight deadlines"*) and a lack of pre-existing UI layouts (*"weak structure"*) meant they had to prompt the AI to build layouts from scratch, resulting in hours of alignment debugging.
*   **Interview #5 (Senior Contractor):** Provided a concrete story of this pain. They vibe-coded a date-parsing function to meet a deadline, which then failed due to timezone offsets. Because the legacy app lacked a centralized date library (weak structure), they spent a *full day* debugging and rewriting it.
