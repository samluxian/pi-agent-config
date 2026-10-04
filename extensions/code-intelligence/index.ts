import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CodeIndex, compare, impact, localPath, query, summary } from "./engine.mjs";

export const CODE_TOOLS = ["code_index", "code_index_status", "code_query", "code_context", "code_impact", "code_validate_change"];

export default function codeIntelligence(pi: ExtensionAPI): void {
  const index = new CodeIndex();
  const root = Type.String({ description: "Explicit absolute path to the authorized Git repository root", minLength: 1 });
  const target = Type.String({ description: "Repository-relative source path, symbol name, or exact symbol ID", minLength: 1 });
  const limit = Type.Optional(Type.Integer({ minimum: 1, maximum: 200, description: "Evidence page size (default 100)" }));
  const options = Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Explicit repository-relative Java dependency JAR paths; no build is executed" }));
  const output = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details: value });

  pi.registerTool({
    name: "code_index", label: "Index source structure",
    description: "Build a full in-memory JavaScript/TypeScript/Java source map with mature compiler APIs. Report coverage, failures and unknowns; do not execute application builds. Re-run after edits or configuration changes.",
    promptGuidelines: ["Before codebase analysis, index the explicit authorized repository. Never infer structural relationships from names. Read actual implementations and distinguish FACT, INFERENCE and UNKNOWN. Index evidence is static, not runtime truth."],
    parameters: Type.Object({ root, javaClasspath: options }),
    async execute(_id, params, signal) { return output(summary(await index.index(params.root, { javaClasspath: params.javaClasspath ?? [] }, signal))); },
  });
  pi.registerTool({
    name: "code_index_status", label: "Source map status",
    description: "Check index coverage and content freshness, including uncommitted edits, configuration changes and source additions/removals.",
    parameters: Type.Object({ root }),
    async execute(_id, params) { const { snapshot, fresh } = await index.current(params.root, false); return output({ ...summary(snapshot), fresh }); },
  });
  pi.registerTool({
    name: "code_query", label: "Query structural evidence",
    description: "Query parser-backed files, symbols, references, dependencies, dependents, unresolved relationships, diagnostics and scope gaps. Evidence IDs belong to one snapshot. Empty results are not proof of absence.",
    parameters: Type.Object({ root, kind: Type.Union(["files", "symbols", "references", "dependencies", "dependents", "unresolved", "diagnostics", "excluded", "unsupported"].map((kind) => Type.Literal(kind))), target: Type.Optional(target), offset: Type.Optional(Type.Integer({ minimum: 0 })), limit }),
    async execute(_id, params) { const { snapshot } = await index.current(params.root); return output(query(snapshot, params.kind, params.target, params.offset, params.limit)); },
  });
  pi.registerTool({
    name: "code_context", label: "Source file context",
    description: "Return a source file's declarations, references, dependency evidence, diagnostics and unknowns before interpreting or modifying it. Tests/routes/config relationships are not guessed.",
    parameters: Type.Object({ root, path: Type.String({ minLength: 1, description: "Repository-relative source path" }), limit }),
    async execute(_id, params) {
      const { snapshot } = await index.current(params.root);
      const path = localPath(snapshot.root, params.path);
      const file = snapshot.files.find((f) => f.path === path);
      if (!file) throw new Error("File is not in the source map. Query files or excluded scope first.");
      return output({ ...summary(snapshot), file,
        symbols: query(snapshot, "symbols", path, 0, params.limit),
        dependencies: query(snapshot, "dependencies", path, 0, params.limit),
        dependents: query(snapshot, "dependents", path, 0, params.limit),
        references: query(snapshot, "references", path, 0, params.limit),
        unresolved: query(snapshot, "unresolved", path, 0, params.limit),
        diagnostics: query(snapshot, "diagnostics", path, 0, params.limit),
        tests: { status: "unknown", reason: "Test associations are not inferred from filenames or naming conventions." },
      });
    },
  });
  pi.registerTool({
    name: "code_impact", label: "Known structural dependents",
    description: "Traverse known resolved dependents up to a bounded depth. This identifies structural candidates, not functions proven to break.",
    parameters: Type.Object({ root, path: Type.String({ minLength: 1 }), depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })), limit }),
    async execute(_id, params) { const { snapshot } = await index.current(params.root); return output(impact(snapshot, localPath(snapshot.root, params.path), params.depth, params.limit)); },
  });
  pi.registerTool({
    name: "code_validate_change", label: "Compare structural snapshots",
    description: "Re-index and compare files, symbols, concrete edges, newly unresolved references, diagnostics and parsing regressions against a retained baseline. Does not edit, rollback, run builds, or replace typechecks/tests.",
    parameters: Type.Object({ root, before: Type.String({ minLength: 1, description: "Snapshot ID retained before editing; only two snapshots per repository are kept" }), limit }),
    async execute(_id, params, signal) {
      const { snapshot } = await index.current(params.root, false);
      const before = index.baseline(snapshot.root, params.before);
      const after = await index.index(snapshot.root, before.options, signal);
      return output(compare(before, after, params.limit));
    },
  });

  // A small always-present invariant complements the lazy-loaded operational skill.
  // This is an evidence policy, not a write-tool restriction or a security sandbox.
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\nCode intelligence: Before analyzing or editing JS/TS/Java source, build/check the authorized repository's full source map with code_index/code_index_status. Support structural claims with current code_query/code_context/code_impact evidence. Distinguish FACT, INFERENCE and UNKNOWN; never invent edges. Inspect implementations as well as the map. Preserve a pre-edit snapshot ID and use code_validate_change afterward, then appropriate static checks/tests. If indexing is unavailable or incomplete, report gaps; do not silently fall back to guessed relationships. Other languages must be reported unsupported. This policy does not grant mutation permissions.`,
  }));
}
