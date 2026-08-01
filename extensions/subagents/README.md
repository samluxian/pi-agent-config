# Read-only Subagents

Provides two bounded agents:

- `scout`: local repository discovery with `read`, `grep`, `find`, and `ls`.
- `researcher`: external documentation research with `web_search` and `web_fetch`.

Subagents receive no parent-session context. The parent must provide paths,
constraints, and the required evidence format. They cannot edit files or mutate
Git, infrastructure, cloud, or runtime systems.

Use `tasks[]` only for independent questions. The default maximum concurrency is
four and may be reduced with an adjacent `config.json`:

```json
{ "maxConcurrency": 2 }
```
