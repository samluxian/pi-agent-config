# Evidence contract

## Three states

- **FACT**: a parser/resolver returned a source location or relationship under the
  reported configuration. Cite its snapshot/evidence ID and file/line.
- **INFERENCE**: an interpretation based on cited facts. Label the interpretation;
  a dependency path does not prove a behavioral regression.
- **UNKNOWN**: the tool cannot establish the relationship, its source is excluded,
  unsupported or failed, or the needed runtime/build evidence is missing.

`resolved` means static resolution in the indexing environment. `external` means
resolution outside indexed source. `unresolved` preserves an observed construct
without inventing a target. An empty result is not proof that no caller exists.

## Coverage and lifecycle

The index discovers tracked and non-ignored source using read-only Git commands.
It does not follow source symlinks, parse dependencies into graph nodes, or read
secret/credential filenames. Common generated/build directories are excluded;
other generated code cannot always be identified automatically. Inspect the
exclusion inventory before claiming whole-repository coverage.

Supported source: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts` and
`.java`. Common other-language source extensions are reported unsupported; this
is not a universal language detector. Omitted assets and non-source files are
not represented by the source map.

Every discovery reports syntax coverage and gaps. Syntax-error recovery trees
are not published as proven definitions/references. Semantic diagnostics and
unresolved edges remain separate from successful syntax parsing. `ready` refers
to source syntax coverage, not compile/test/runtime readiness.

Freshness hashes inventoried source/configuration and explicitly supplied Java
JAR contents. It detects source/configuration additions, edits and removals,
including uncommitted changes. It does not verify every installed dependency
file or replacement compiler binary. Re-index after dependencies change; reload
Pi after parser/runtime updates. Never use a snapshot ID from another process.

Indexes remain in memory and disappear on reload/process exit. Two snapshots
per repository are retained. No SQLite database, daemon, target config or ignored
cache is created. The first version rebuilds the full index after edits rather
than risking incorrect incremental invalidation.

## Language limitations

### JavaScript / TypeScript

TypeScript Compiler API parses both languages and resolves modules/symbols.
The nearest inventoried `tsconfig.json` or `jsconfig.json` supplies options;
otherwise an explicit default NodeNext indexing environment is used. All
inventoried JS/TS files are included for structural mapping, even when the normal
build excludes JS. Safe dependency declarations and package metadata may be read
for resolution, but are not indexed as repository source.

Uninventoried `extends` configuration, external workspace links, absent packages,
project-reference/build differences, dynamic properties/imports and reflection
can leave gaps. CommonJS `require` is only attributed as a loader when its symbol
resolves to Node's declarations; unestablished loaders are UNKNOWN. No complete
call graph, runtime execution or automatic import of missing packages occurs.

### Java

A full JDK 17+ supplies public `JavaCompiler`, `JavacTask` and `Trees` APIs. The
helper is source-launched; target source is supplied from the inventoried
contents. It only parses and attributes, with annotation processing disabled,
empty implicit source/class paths and no class emission.

All inventoried Java files currently form one compiler task, not a reconstructed
Maven/Gradle multi-module build. Dependency JARs must be explicitly supplied as
repository-local paths. Missing classpath/modulepath, generated types, duplicate
classes across source sets, build-specific language flags and wildcard imports
are visible diagnostics/unknowns, not guessed relationships. Use actual build
checks to establish compatibility; do not infer them from the graph.

## Edges and validation

The first version emits `IMPORTS`, source re-`EXPORTS` and `REFERENCES` where
supported. It does not claim complete `CALLS`, `EXTENDS`, `IMPLEMENTS`, `TESTS`,
route or configuration-read relationships. Symbols retain declaration locations.

Graph comparison reports file and symbol changes plus concrete edges rather than
just counts. Impact is depth-bounded; `limit` controls output pagination, not how
many graph edges are examined. Edge changes
can reflect line/position movement as well as relationship changes. Newly
unresolved edges or previously parsed files that fail are regression signals to
investigate, not automatic proof that an intended change is wrong. Compilation
and tests remain separate required evidence where appropriate.
