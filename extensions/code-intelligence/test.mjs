import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import extension, { CODE_TOOLS } from "./index.ts";
import { buildSnapshot, CodeIndex, compare, discover, impact, localPath, page, permittedPath, query, summary } from "./engine.mjs";
import { analyzeTypeScript } from "./typescript.mjs";
import { analyzeJava, runCompiler } from "./java.mjs";

async function fixture(t, contents) {
  const root = await mkdtemp(join(tmpdir(), "pi-code-intel-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(contents)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  // Test discovery without mutating any Git repository or Git metadata.
  const names = () => Object.keys(contents);
  const scan = (path, options) => discover(path, options, names);
  return { root, scan, contents };
}
const edge = (source, target, line = 1) => ({ kind: "IMPORTS", source, target, line, column: 1, status: "resolved" });
function snapshot(edges, fingerprint = "a", parsed = ["a.ts", "b.ts", "c.ts"]) {
  return buildSnapshot({ root: "/repository", fingerprint, options: {}, files: ["a.ts", "b.ts", "c.ts"].map((path) => ({ path, language: "typescript", hash: fingerprint })), configs: [], issues: [], excluded: [], unsupported: [] }, [{ adapter: { language: "typescript", status: "available" }, parsed, symbols: [], edges, diagnostics: [] }]);
}

test("registers six read-only evidence tools and an invariant without write restrictions", async () => {
  const tools = new Map();
  const events = new Map();
  extension({ registerTool: (tool) => tools.set(tool.name, tool), on: (name, handler) => events.set(name, handler) });
  assert.deepEqual([...tools.keys()], CODE_TOOLS);
  assert.equal(events.has("tool_call"), false);
  const prompt = await events.get("before_agent_start")({ systemPrompt: "existing instructions" });
  assert.match(prompt.systemPrompt, /^existing instructions/);
  assert.match(prompt.systemPrompt, /FACT, INFERENCE and UNKNOWN/);
  assert.match(prompt.systemPrompt, /does not grant mutation permissions/);
  await assert.rejects(tools.get("code_index_status").execute("id", { root: "/definitely-not-a-real-repository" }), /ENOENT/);
});

test("discovery hashes source/config and reports unsupported/excluded without reading them", async (t) => {
  const f = await fixture(t, { "src/a.ts": "export const a = 1;", "src/b.js": "export const b = 2;", "tsconfig.json": "{}", "src/tool.py": "# unsupported", "src/secret.ts": "excluded", "dist/bundle.js": "excluded" });
  // Excluded filenames remain discoverable even if their contents are unreadable.
  const inventory = await f.scan(f.root);
  assert.deepEqual(inventory.files.map((file) => file.path), ["src/a.ts", "src/b.js"]);
  assert.deepEqual(inventory.configs.map((file) => file.path), ["tsconfig.json"]);
  assert.deepEqual(inventory.unsupported, ["src/tool.py"]);
  assert.equal(inventory.excluded.length, 2);
  await writeFile(join(f.root, "tsconfig.json"), '{"compilerOptions":{"baseUrl":"."}}');
  assert.notEqual((await f.scan(f.root)).fingerprint, inventory.fingerprint);
  assert.equal(permittedPath(".env.production"), false);
  assert.equal(permittedPath("private-key.js"), false);
  assert.equal(permittedPath("src/app.ts"), true);
});

test("discovery does not traverse source symlinks or accept classpath escape", async (t) => {
  const f = await fixture(t, { "src/a.ts": "export {};" });
  await symlink(join(f.root, "src/a.ts"), join(f.root, "linked.ts"));
  f.contents["linked.ts"] = "";
  const inventory = await f.scan(f.root);
  assert.equal(inventory.files.length, 1);
  assert.ok(inventory.excluded.some((e) => e.path === "linked.ts"));
  await assert.rejects(f.scan(f.root, { javaClasspath: ["../dependency.jar"] }), /outside/);
  assert.throws(() => localPath(f.root, "/absolute.ts"), /relative/);
  assert.throws(() => localPath(f.root, "../outside.ts"), /outside/);
  await assert.rejects(discover("relative-root"), /absolute/);
});

test("symbols and concrete edges have snapshot-bound evidence IDs and bounded queries", () => {
  const s = snapshot([edge("a.ts", "b.ts"), edge("c.ts", "a.ts")]);
  assert.equal(query(s, "dependents", "b.ts").items[0].source, "a.ts");
  assert.equal(query(s, "dependencies", "a.ts").items[0].target, "b.ts");
  assert.match(s.edges[0].evidenceId, new RegExp(`^${s.snapshotId}:E:`));
  assert.equal(page(Array.from({ length: 210 }, (_, n) => n), 0, 200).nextOffset, 200);
  assert.equal(page([1], 0, 100).nextOffset, null);
});

test("impact follows resolved file and cross-file symbol references, never guesses unknown edges", () => {
  const s = snapshot([edge("a.ts", "b.ts"), { kind: "REFERENCES", source: "c.ts", target: "a.ts#9", targetPath: "a.ts", status: "resolved", line: 3, column: 1 }, { kind: "IMPORTS", source: "unknown.ts", status: "unresolved", line: 2, column: 1 }]);
  assert.deepEqual(impact(s, "b.ts", 2).files.items, ["a.ts", "c.ts"]);
  assert.equal(impact(s, "b.ts", 1).files.total, 1);
  assert.match(impact(s, "b.ts").interpretation, /not proof/);
  assert.equal(query(s, "dependents", "a.ts").items[0].source, "c.ts");
});

test("graph validation compares edge identities even when aggregate counts are unchanged", () => {
  const before = snapshot([edge("a.ts", "b.ts")]);
  const after = snapshot([edge("a.ts", "c.ts")], "b");
  assert.equal(before.edges.length, after.edges.length);
  const diff = compare(before, after);
  assert.equal(diff.removed.items[0].target, "b.ts");
  assert.equal(diff.added.items[0].target, "c.ts");
  assert.equal(diff.structuralRegression, false);
  assert.match(diff.interpretation, /not a typecheck/);
});

test("validation reports newly unresolved relationships and parser regressions", () => {
  const before = snapshot([edge("a.ts", "b.ts")]);
  const after = snapshot([{ kind: "IMPORTS", source: "a.ts", line: 1, column: 1, status: "unresolved", reason: "module-not-resolved" }], "b", ["a.ts", "c.ts"]);
  const diff = compare(before, after);
  assert.equal(diff.structuralRegression, true);
  assert.equal(diff.newlyUnresolved.total, 1);
  assert.deepEqual(diff.newlyFailed.items.map((f) => f.path), ["b.ts"]);
  assert.equal(summary(after).ready, false);
});

test("adapter failure remains visible and is never replaced with text-derived edges", async (t) => {
  const f = await fixture(t, { "a.ts": 'import { b } from "./b";', "b.ts": "export const b = 1;" });
  const index = new CodeIndex({ typescript: async () => { throw new Error("parser unavailable"); } }, f.scan);
  const s = await index.index(f.root);
  assert.equal(s.coverage.failed, 2);
  assert.equal(s.edges.length, 0);
  assert.ok(s.diagnostics.every((d) => d.reason === "adapter-failure"));
  assert.equal(summary(s).ready, false);
});

test("freshness rejects edits, additions, removals and config changes; retains two snapshots", async (t) => {
  const f = await fixture(t, { "a.ts": "export const a = 1;", "tsconfig.json": "{}" });
  const adapter = async (inventory) => ({ adapter: { language: "typescript" }, parsed: inventory.files.map((file) => file.path), edges: [], symbols: [] });
  const index = new CodeIndex({ typescript: adapter }, f.scan);
  const first = await index.index(f.root);
  assert.equal((await index.current(f.root)).fresh, true);
  await writeFile(join(f.root, "a.ts"), "export const a = 2;");
  await assert.rejects(index.current(f.root), /stale/);
  assert.equal((await index.current(f.root, false)).fresh, false);
  const second = await index.index(f.root);
  assert.equal(index.baseline(f.root, first.snapshotId).snapshotId, first.snapshotId);
  await writeFile(join(f.root, "b.ts"), "export {};" );
  f.contents["b.ts"] = "export {};";
  await assert.rejects(index.current(f.root), /stale/);
  await index.index(f.root);
  assert.throws(() => index.baseline(f.root, first.snapshotId), /Baseline unavailable/);
  assert.equal(index.baseline(f.root, second.snapshotId).snapshotId, second.snapshotId);
  delete f.contents["b.ts"];
  await assert.rejects(index.current(f.root), /stale/);
  await index.index(f.root);
  await writeFile(join(f.root, "tsconfig.json"), '{"compilerOptions":{"strict":true}}');
  await assert.rejects(index.current(f.root), /stale/);
});

test("changes during parsing and cancellation do not publish misleading snapshots", async (t) => {
  const f = await fixture(t, { "a.ts": "export {};" });
  const changing = new CodeIndex({ typescript: async () => { await writeFile(join(f.root, "a.ts"), "export const changed = true;"); return { adapter: {}, parsed: ["a.ts"] }; } }, f.scan);
  await assert.rejects(changing.index(f.root), /changed while indexing/);
  assert.equal(changing.snapshots.size, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(new CodeIndex(undefined, f.scan).index(f.root, {}, controller.signal), /cancelled/);
});

test("validation reports renamed symbols even when their source offset stays the same", () => {
  const before = snapshot([]);
  const after = snapshot([], "b");
  before.symbols = [{ id: "a.ts#0", path: "a.ts", name: "oldName", kind: "FunctionDeclaration", line: 1, column: 1 }];
  after.symbols = [{ ...before.symbols[0], name: "newName" }];
  const diff = compare(before, after);
  assert.equal(diff.symbolsRemoved.items[0].name, "oldName");
  assert.equal(diff.symbolsAdded.items[0].name, "newName");
  assert.equal(diff.changedFiles.total, 3);
});

function fakeCompiler(action) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    if (signal === "SIGKILL") queueMicrotask(() => child.emit("close", null));
    return true;
  };
  queueMicrotask(() => action?.(child));
  return child;
}

test("Java process protocol preserves split UTF-8 and never returns raw stderr", async () => {
  const child = fakeCompiler((p) => {
    const bytes = Buffer.from('{"name":"測試"}');
    p.stderr.write("unreturned source excerpt");
    p.stdout.write(bytes.subarray(0, 10));
    p.stdout.write(bytes.subarray(10));
    p.emit("close", 0);
  });
  assert.deepEqual(await runCompiler("input", "/repository", undefined, { spawnProcess: () => child }), { name: "測試" });
});

test("Java process timeout escalates termination and rejects after reaping", async () => {
  const child = fakeCompiler();
  await assert.rejects(runCompiler("input", "/repository", undefined, { spawnProcess: () => child, timeoutMs: 5, graceMs: 1 }), /time budget/);
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
});

test("Java output budget stops retention and escalates a stuck compiler", async () => {
  const child = fakeCompiler((p) => p.stdout.write("too much output"));
  await assert.rejects(runCompiler("input", "/repository", undefined, { spawnProcess: () => child, outputLimit: 2, graceMs: 1 }), /output budget/);
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
});

test("Java process startup failures remain an explicit runtime gap", async () => {
  const child = fakeCompiler((p) => { p.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })); p.emit("close", -2); });
  await assert.rejects(runCompiler("input", "/repository", undefined, { spawnProcess: () => child }), /JDK 17/);
});

const require = createRequire(import.meta.url);
let hasTypeScript = false;
try { require.resolve("typescript"); hasTypeScript = true; } catch {}
const javaVersion = spawnSync("java", ["-version"], { encoding: "utf8" });
const hasJava = javaVersion.status === 0;

test("TypeScript compiler resolves aliases, symbols and re-exports; emits unresolved dynamic imports", { skip: hasTypeScript ? false : "Declared TypeScript runtime is not installed" }, async (t) => {
  const f = await fixture(t, { "tsconfig.json": '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]},"module":"ESNext","moduleResolution":"Bundler"}}', "src/value.ts": "export const value = 1;", "src/app.ts": 'import { value } from "@/value"; export { value } from "./value"; console.log(value); import(unknownPath);' });
  const s = await new CodeIndex(undefined, f.scan).index(f.root);
  assert.equal(s.coverage.parsed, 2);
  assert.ok(s.edges.some((e) => e.kind === "IMPORTS" && e.target === "src/value.ts" && e.status === "resolved"));
  assert.ok(s.edges.some((e) => e.kind === "EXPORTS" && e.target === "src/value.ts"));
  assert.ok(s.edges.some((e) => e.kind === "REFERENCES" && e.targetPath === "src/value.ts"));
  assert.ok(s.edges.some((e) => e.reason === "dynamic-module-specifier"));
});

test("JavaScript compiler does not treat a locally shadowed require as a module import", { skip: hasTypeScript ? false : "Declared TypeScript runtime is not installed" }, async (t) => {
  const f = await fixture(t, { "value.js": "export const value = 1;", "app.js": 'import { value } from "./value.js"; function require(x) { return x; } require("./missing.js"); console.log(value);' });
  const inventory = await f.scan(f.root);
  const result = await analyzeTypeScript(inventory);
  assert.equal(result.parsed.length, 2);
  assert.ok(result.edges.some((e) => e.kind === "IMPORTS" && e.target === "value.js"));
  assert.equal(result.edges.filter((e) => e.specifier === "./missing.js").length, 0);
});

test("syntax failures do not publish recovered TypeScript AST as proven structure", { skip: hasTypeScript ? false : "Declared TypeScript runtime is not installed" }, async (t) => {
  const f = await fixture(t, { "bad.ts": "export const = ;" });
  const result = await analyzeTypeScript(await f.scan(f.root));
  assert.equal(result.parsed.length, 0);
  assert.equal(result.symbols.length, 0);
  assert.equal(result.edges.length, 0);
  assert.ok(result.diagnostics.some((d) => d.reason === "syntax-error"));
});

test("javac resolves cross-file source references without emitting class files", { skip: hasJava ? false : "JDK 17+ is not installed" }, async (t) => {
  const f = await fixture(t, { "example/Repository.java": "package example; public class Repository { public int count() { return 1; } }", "example/Service.java": "package example; public class Service { Repository repo = new Repository(); int count() { return repo.count(); } }" });
  const result = await analyzeJava(await f.scan(f.root));
  assert.equal(result.parsed.length, 2);
  assert.ok(result.edges.some((e) => e.status === "resolved" && e.source === "example/Service.java" && e.targetPath === "example/Repository.java"));
  assert.ok(result.symbols.some((s) => s.name === "Service"));
  await assert.rejects(readFile(join(f.root, "example/Service.class")), /ENOENT/);
});

test("javac exposes missing types and syntax errors, not invented dependencies", { skip: hasJava ? false : "JDK 17+ is not installed" }, async (t) => {
  const f = await fixture(t, { "Service.java": "class Service { Missing value; }", "Bad.java": "class Bad { void broken( }" });
  const result = await analyzeJava(await f.scan(f.root));
  assert.ok(result.parsed.includes("Service.java"));
  assert.equal(result.parsed.includes("Bad.java"), false);
  assert.ok(result.edges.some((e) => e.name === "Missing" && e.status === "unresolved"));
  assert.ok(result.diagnostics.some((d) => d.path === "Bad.java" && d.reason === "syntax-error"));
  assert.equal(result.symbols.some((s) => s.path === "Bad.java"), false);
});
