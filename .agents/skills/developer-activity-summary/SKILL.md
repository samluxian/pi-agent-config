---
name: developer-activity-summary
description: Summarize authenticated GitLab or GitHub activity into dated action-led updates. Use for bounded daily activity reports with an explicit fallback window. Do not use for MR prose, repo audits, performance evaluation, or implementation.
---

# Developer Activity Summary

Produce a short daily update from authenticated, read-only activity evidence.
Never infer work from repository contents alone.

## Flow

1. Fix the reporting window.
   - Resolve absolute dates, included platforms, and output language.
   - Default to `Asia/Taipei`; use another timezone only when explicitly requested.
   - Treat any fallback platform or date range as separate evidence.
   - Ask one question if the window is ambiguous.

2. Confirm identity.
   - Use authenticated `glab` or `gh` identity evidence.
   - Stop on missing authentication or unresolved identity mismatch.
   - Do not search for tokens or credentials.

3. Collect bounded evidence.
   - Prefer `.agents/skills/developer-activity-summary/scripts/collect_activity.py`.
   - Use authored commits, MRs/PRs, reviews, comments, issues, and repository
     events only when their timestamps fall inside the requested window.
   - Keep primary and fallback platform evidence separate.

4. Apply fallback only when needed.
   - Use fallback evidence only for dates lacking sufficient primary evidence.
   - Label fallback use and never move activity across dates to fill gaps.
   - Report dates with no supported activity instead of inventing work.

5. Write the summary.
   - Group by local calendar date.
   - Prefer merged or reviewed delivery evidence over low-signal events.
   - Deduplicate events describing the same work item.
   - Start every update with an action, result, or work item, never a personal
     pronoun such as 我、我們、你、他、她、他們、I、We、You、He、She, or They.
   - When first-person voice is requested, omit the subject at the start or place
     the personal reference later. Avoid performance judgments.

## Output

```text
Summary:
- YYYY-MM-DD: concise action-led update without a sentence-initial personal pronoun

Evidence:
- Primary identity, platform, timezone (default `Asia/Taipei`), and date window
- Fallback identity/platform/window when used

Gaps:
- Dates or claims without sufficient evidence
```

Do not include tokens, private repository URLs beyond what the user supplied,
full API payloads, or unrelated activity.
