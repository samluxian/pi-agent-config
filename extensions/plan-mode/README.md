# Plan mode

Adapted from the Pi `examples/extensions/plan-mode` example. `/plan` (or Ctrl+Alt+P) toggles a read-only planning session; `/todos` shows extracted steps. `--plan` starts in planning mode. The extension retains plan state across session resume.

While enabled, only already-active `read`, `grep`, `find`, `ls`, `subagent`, and the six read-only `code_*` intelligence tools (`code_index`, `code_index_status`, `code_query`, `code_context`, `code_impact`, `code_validate_change`) remain available. Intelligence indexing/validation only updates memory and never edits target files or executes builds. The `subagent` tool accepts only `scout`, `environment-scout`, and `researcher`, in single or parallel mode. `worker`, bash, write/edit, chain requests, and all other tools are blocked at tool-call time. The extension does not impose plan mode inside child processes.

Plan mode never starts implementation automatically. The user must explicitly request implementation separately; toggle `/plan` off before an authorized edit. A numbered `Plan:` section is displayed via `/todos`, but marking a step done is not proof of verification. Existing repository, safety, and approval rules still apply. Tool restrictions do not sandbox extension code or user-issued shell commands.
