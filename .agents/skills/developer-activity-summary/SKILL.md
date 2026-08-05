---
name: developer-activity-summary
description: Summarize an authenticated developer's dated GitLab or GitHub activity into concise first-person daily updates. Use when the user asks what they worked on over specified days based on glab/gh evidence, including an explicit fallback date range. Do not use for MR descriptions, repository audits, performance evaluation, or repo implementation.
---

# Developer Activity Summary

Turn authenticated GitLab/GitHub activity into short, evidence-based daily work
updates. Treat remote systems as read-only.

## 1. Fix the reporting window

Identify the year, inclusive primary dates, output language, and timezone. Ask
one concise question if any required value is missing; default the timezone to
`Asia/Taipei` only when that matches the user's context. Keep separately named
fallback dates as supporting context and never silently assign fallback work to
a primary date.

Completion criterion: every requested paragraph maps to one explicit primary
calendar date in the selected timezone.

## 2. Confirm authenticated identities

Use read-only identity calls:

```bash
glab api user | jq '{id, username, name, web_url}'
gh api user --jq '{login: .login, name: .name, html_url: .html_url}'
```

Run only the provider needed for the current evidence pass. Do not print auth
configuration, tokens, credential files, or environment variables.

Completion criterion: each queried provider is tied to the intended account.

## 3. Collect bounded evidence

Run the bundled collector from the skills repository:

```bash
python3 .agents/skills/developer-activity-summary/scripts/collect_activity.py \
  --gitlab-from YYYY-MM-DD --gitlab-to YYYY-MM-DD \
  --timezone Asia/Taipei --role primary \
  --output tmp/developer-activity-primary.json
```

The collector uses only read-only `glab api`/`gh api` calls and emits normalized,
bounded JSON. Always pass the selected timezone. For a GitHub-only pass, use
`--github-from`, `--github-to`, and the same `--timezone`. Do not broaden to
repository source, diffs, pipelines, or live systems unless a specific title
remains ambiguous and the user asks for deeper attribution.

Completion criterion: each primary day has a compact evidence list or is
explicitly marked empty.

## 4. Use fallback evidence only when needed

A day is insufficient when it has no evidence or only branch deletion, generic
push, or title-free activity. If the user supplied fallback dates, preserve the
primary report and write a separate supplemental report:

```bash
python3 .agents/skills/developer-activity-summary/scripts/collect_activity.py \
  --github-from YYYY-MM-DD --github-to YYYY-MM-DD \
  --timezone Asia/Taipei --role supplemental \
  --output tmp/developer-activity-supplemental.json
```

Do not combine primary and fallback providers in one collector call. If either
provider reports `evidence_complete: false`, read `limitations` and disclose the
relevant evidence gap. Restricted GitHub contributions never prove an empty
day. If fallback evidence cannot support a primary day, report the gap instead
of inventing work.

Completion criterion: every claim is supported by a project, MR/issue title,
review, or contribution record, fallback inference remains visible, and API or
visibility limitations are not hidden.

## 5. Write the daily summary

Produce one short paragraph per primary date, in chronological order and from
the user's perspective (`我…`). Prefer one sentence per day. Group related
titles into the underlying outcome instead of listing every event.

- Use completion verbs only for merged/accepted work or concrete commits.
- Describe opened work as started or prepared, approved work as reviewed, and
  closed-unmerged work as attempted or adjusted.
- Do not turn activity volume into effort, impact, productivity, or performance
  claims.
- Mention an evidence gap only when it changes the interpretation.
- Omit links and collection mechanics unless the user asks for evidence.

Default format:

```text
1. **M/D**：我……
2. **M/D**：我……
```

Completion criterion: paragraph count equals the number of primary dates, every
paragraph is first-person and concise, and no unsupported completion claim
remains.
