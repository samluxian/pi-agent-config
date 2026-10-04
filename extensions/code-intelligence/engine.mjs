import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { analyzeTypeScript } from "./typescript.mjs";
import { analyzeJava } from "./java.mjs";

const exec = promisify(execFile);
const SOURCE = /\.(?:[cm]?[jt]sx?|java)$/i;
const OTHER_SOURCE = /\.(?:py|go|rs|kt|kts|rb|c|h|cpp|cs|php|swift)$/i;
const CONFIG = /(?:^|\/)(?:(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json|package\.json)$/;
const EXCLUDED_DIR = /(?:^|\/)(?:\.git|\.pi|node_modules|vendor|dist|build|target|coverage|\.next|\.gradle|\.cache)(?:\/|$)/;
const SENSITIVE = /(?:^|\/)(?:\.env(?:\.[^/]*)?|[^/]*(?:credential|secret|private[-_]?key)[^/]*|id_rsa|id_ed25519)(?:\/|$)|\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const GENERATED = /(?:\.min\.[jt]s|\.generated\.[^/]+)$/i;
const MAX_FILES = 10000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const languageOf = (path) => path.endsWith(".java") ? "java" : /\.[cm]?tsx?$/i.test(path) ? "typescript" : "javascript";
export const permittedPath = (path) => !EXCLUDED_DIR.test(path) && !SENSITIVE.test(path) && !GENERATED.test(path);
const slash = (path) => path.split(sep).join("/");

export function localPath(root, target) {
  if (isAbsolute(target)) throw new Error("Use a repository-relative target.");
  const path = slash(relative(root, resolve(root, target)));
  if (!path || path === ".." || path.startsWith("../") || !permittedPath(path)) {
    throw new Error("Target is outside the permitted source scope.");
  }
  return path;
}

// Discovery never reads excluded paths. Git supplies tracked and non-ignored files;
// symbolic links (including parent directories) are not traversed.
async function gitFiles(root) {
  const { stdout: top } = await exec("git", ["--no-optional-locks", "-C", root, "rev-parse", "--show-toplevel"]);
  if (await realpath(top.trim()) !== root) throw new Error("Index an explicit Git repository root, not its parent or a subdirectory.");
  const { stdout } = await exec("git", ["--no-optional-locks", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: 16 * 1024 * 1024 });
  return stdout.split("\0").filter(Boolean);
}

export async function discover(root, options = {}, listFiles = gitFiles) {
  if (!isAbsolute(root)) throw new Error("Use an explicit absolute repository root.");
  root = await realpath(root);
  const names = [...new Set(await listFiles(root))].sort();
  const files = [];
  const configs = [];
  const issues = [];
  const excluded = [];
  const unsupported = [];
  let totalBytes = 0;
  for (const path of names) {
    if (!SOURCE.test(path) && !CONFIG.test(path) && !OTHER_SOURCE.test(path)) continue;
    if (!permittedPath(path)) { excluded.push({ path, reason: "excluded-by-policy" }); continue; }
    const parts = path.split("/");
    let safe = true;
    for (let i = 1; i <= parts.length; i++) {
      try { if ((await lstat(join(root, ...parts.slice(0, i)))).isSymbolicLink()) safe = false; }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        safe = false;
      }
      if (!safe) break;
    }
    if (!safe) { excluded.push({ path, reason: "symlink-or-missing" }); continue; }
    if (OTHER_SOURCE.test(path)) { unsupported.push(path); continue; }
    const stat = await lstat(join(root, path));
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) {
      issues.push({ path, reason: "file-size-limit" });
      // Size/mtime keeps a skipped file visible to the freshness check without reading it.
      const skipped = { path, hash: `${stat.size}:${stat.mtimeMs}`, skipped: true };
      if (CONFIG.test(path)) configs.push(skipped);
      else files.push({ ...skipped, language: languageOf(path) });
      if (files.length > MAX_FILES) throw new Error("Repository exceeds the source-file limit; no new index was published.");
      continue;
    }
    totalBytes += stat.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Repository source exceeds the memory budget; no new index was published.");
    const content = await readFile(join(root, path), "utf8");
    const entry = { path, hash: digest(content), content };
    if (CONFIG.test(path)) configs.push(entry);
    else files.push({ ...entry, language: languageOf(path) });
    if (files.length > MAX_FILES) throw new Error("Repository exceeds the source-file limit; no new index was published.");
  }
  const classpath = [];
  for (const item of options.javaClasspath ?? []) {
    const path = localPath(root, item);
    if (!path.endsWith(".jar")) throw new Error("Java classpath entries must be explicit repository-local JAR files.");
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      if ((await lstat(join(root, ...parts.slice(0, i)))).isSymbolicLink()) throw new Error("Classpath symlinks are not supported.");
    }
    const stat = await lstat(join(root, path));
    if (!stat.isFile()) throw new Error("Classpath entries must be JAR files.");
    totalBytes += stat.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Source/config/JAR inputs exceed the read budget; no new index was published.");
    classpath.push({ path, hash: digest(await readFile(join(root, path))) });
  }
  const fingerprint = digest(JSON.stringify({
    files: files.map(({ path, hash }) => [path, hash]),
    configs: configs.map(({ path, hash }) => [path, hash]),
    excluded, unsupported, issues, classpath, options,
  }));
  return { root, files, configs, issues, excluded, unsupported, classpath, fingerprint };
}

function edgeKey(edge) {
  return JSON.stringify([edge.kind, edge.source, edge.target ?? null, edge.targetPath ?? null, edge.name ?? null, edge.specifier ?? null, edge.line, edge.column, edge.status, edge.reason ?? null]);
}

export function buildSnapshot(inventory, results) {
  const symbols = [];
  const edges = [];
  const diagnostics = [...inventory.issues];
  const languages = [];
  const parsed = new Set();
  for (const result of results) {
    languages.push(result.adapter);
    for (const path of result.parsed ?? []) parsed.add(path);
    symbols.push(...(result.symbols ?? []));
    edges.push(...(result.edges ?? []));
    diagnostics.push(...(result.diagnostics ?? []));
  }
  const uniqueSymbols = [...new Map(symbols.map((s) => [s.id, { ...s }])).values()];
  const uniqueEdges = [...new Map(edges.map((e) => [edgeKey(e), { ...e }])).values()];
  const snapshotId = digest(JSON.stringify({ fingerprint: inventory.fingerprint, languages, symbols: uniqueSymbols, edges: uniqueEdges, diagnostics })).slice(0, 20);
  for (const symbol of uniqueSymbols) symbol.evidenceId = `${snapshotId}:S:${digest(symbol.id).slice(0, 16)}`;
  for (const edge of uniqueEdges) edge.evidenceId = `${snapshotId}:E:${digest(edgeKey(edge)).slice(0, 16)}`;
  const files = inventory.files.map(({ path, language, hash, skipped }) => ({ path, language, hash, parsed: parsed.has(path), skipped: !!skipped }));
  return {
    snapshotId, root: inventory.root, fingerprint: inventory.fingerprint,
    options: inventory.options ?? {}, files, symbols: uniqueSymbols, edges: uniqueEdges,
    languages, diagnostics, excluded: inventory.excluded, unsupported: inventory.unsupported,
    coverage: { discovered: files.length, parsed: files.filter((f) => f.parsed).length, failed: files.filter((f) => !f.parsed).length, unsupported: inventory.unsupported.length, excluded: inventory.excluded.length },
  };
}

export function summary(snapshot) {
  return {
    root: snapshot.root, snapshotId: snapshot.snapshotId, coverage: snapshot.coverage,
    ready: snapshot.coverage.discovered > 0 && snapshot.coverage.failed === 0,
    languages: snapshot.languages, symbols: snapshot.symbols.length, edges: snapshot.edges.length,
    unresolved: snapshot.edges.filter((e) => e.status === "unresolved").length,
    diagnostics: snapshot.diagnostics.length,
    limits: ["Static structure only, not runtime behavior or a complete call graph.", "TESTS, routes and configuration relationships are not inferred.", "Unsupported and excluded files are outside coverage.", "Freshness covers inventoried source/config/JAR contents, not replacement of compiler runtimes or installed dependency declarations; re-index after dependency changes and reload after parser/runtime updates."],
  };
}

export function page(items, offset = 0, limit = 100) {
  limit = Math.min(200, Math.max(1, limit));
  offset = Math.max(0, offset);
  return { items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}

export function query(snapshot, kind, target, offset = 0, limit = 100) {
  const symbols = new Map(snapshot.symbols.map((s) => [s.id, s]));
  const sourceFile = (e) => symbols.get(e.source)?.path ?? e.source;
  const targetFile = (e) => e.targetPath ?? symbols.get(e.target)?.path ?? e.target;
  let items;
  switch (kind) {
    case "files": items = snapshot.files; break;
    case "symbols": items = snapshot.symbols.filter((s) => !target || s.path === target || s.id === target || s.name === target); break;
    case "references": items = snapshot.edges.filter((e) => e.kind === "REFERENCES" && (!target || e.target === target || targetFile(e) === target)); break;
    case "dependencies": items = snapshot.edges.filter((e) => (!target || sourceFile(e) === target) && targetFile(e) !== sourceFile(e)); break;
    case "dependents": items = snapshot.edges.filter((e) => e.status === "resolved" && (!target || targetFile(e) === target) && sourceFile(e) !== targetFile(e)); break;
    case "unresolved": items = snapshot.edges.filter((e) => e.status === "unresolved" && (!target || sourceFile(e) === target)); break;
    case "diagnostics": items = snapshot.diagnostics.filter((d) => !target || d.path === target); break;
    case "excluded": items = snapshot.excluded; break;
    case "unsupported": items = snapshot.unsupported; break;
    default: throw new Error("Unknown query kind.");
  }
  return { ...summary(snapshot), kind, ...page(items, offset, limit) };
}

export function impact(snapshot, target, depth = 2, limit = 100) {
  if (!snapshot.files.some((f) => f.path === target)) throw new Error("Target is not in the source map.");
  depth = Math.min(5, Math.max(1, depth));
  const symbols = new Map(snapshot.symbols.map((s) => [s.id, s.path]));
  const visited = new Set([target]);
  let frontier = new Set([target]);
  const evidence = [];
  for (let step = 1; step <= depth && frontier.size; step++) {
    const next = new Set();
    for (const edge of snapshot.edges) {
      const source = symbols.get(edge.source) ?? edge.source;
      const destination = edge.targetPath ?? symbols.get(edge.target) ?? edge.target;
      if (edge.status !== "resolved" || source === destination || !frontier.has(destination)) continue;
      evidence.push({ ...edge, depth: step });
      if (!visited.has(source)) { visited.add(source); next.add(source); }
    }
    frontier = next;
  }
  return { ...summary(snapshot), target, depth, interpretation: "Known transitive dependents, not proof of behavioral breakage.", files: page([...visited].filter((p) => p !== target), 0, limit), evidence: page(evidence, 0, limit) };
}

export function compare(before, after, limit = 100) {
  if (before.root !== after.root || JSON.stringify(before.options) !== JSON.stringify(after.options)) throw new Error("Compare snapshots of the same repository and indexing options.");
  const old = new Map(before.edges.map((e) => [edgeKey(e), e]));
  const current = new Map(after.edges.map((e) => [edgeKey(e), e]));
  const added = after.edges.filter((e) => !old.has(edgeKey(e)));
  const removed = before.edges.filter((e) => !current.has(edgeKey(e)));
  const newlyUnresolved = added.filter((e) => e.status === "unresolved");
  const newlyFailed = after.files.filter((f) => !f.parsed && !before.files.some((b) => b.path === f.path && !b.parsed));
  const symbolKey = (s) => JSON.stringify([s.id, s.path, s.name, s.kind, s.line, s.column]);
  const oldSymbols = new Set(before.symbols.map(symbolKey));
  const newSymbols = new Set(after.symbols.map(symbolKey));
  const symbolsAdded = after.symbols.filter((s) => !oldSymbols.has(symbolKey(s)));
  const symbolsRemoved = before.symbols.filter((s) => !newSymbols.has(symbolKey(s)));
  const oldFiles = new Map(before.files.map((f) => [f.path, f.hash]));
  const newFiles = new Map(after.files.map((f) => [f.path, f.hash]));
  const changedFiles = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].filter((path) => oldFiles.get(path) !== newFiles.get(path)).map((path) => ({ path, change: !oldFiles.has(path) ? "added" : !newFiles.has(path) ? "removed" : "modified" }));
  const oldDiagnostics = new Set(before.diagnostics.map((d) => JSON.stringify(d)));
  const newDiagnostics = after.diagnostics.filter((d) => !oldDiagnostics.has(JSON.stringify(d)));
  return {
    before: summary(before), after: summary(after), changedFiles: page(changedFiles, 0, limit), added: page(added, 0, limit), removed: page(removed, 0, limit),
    symbolsAdded: page(symbolsAdded, 0, limit), symbolsRemoved: page(symbolsRemoved, 0, limit),
    newlyUnresolved: page(newlyUnresolved, 0, limit), newlyFailed: page(newlyFailed, 0, limit), newDiagnostics: page(newDiagnostics, 0, limit),
    structuralRegression: newlyUnresolved.length > 0 || newlyFailed.length > 0,
    interpretation: "Review concrete changes against intent. This is not a typecheck, test result, or automatic rollback.",
  };
}

export class CodeIndex {
  constructor(adapters = { typescript: analyzeTypeScript, java: analyzeJava }, scan = discover) {
    this.adapters = adapters;
    this.scan = scan;
    this.snapshots = new Map();
  }
  async index(root, options = {}, signal) {
    const inventory = await this.scan(root, options);
    inventory.options = options;
    const results = [];
    for (const language of ["typescript", "java"]) {
      const files = inventory.files.filter((f) => !f.skipped && (language === "java" ? f.language === "java" : f.language !== "java"));
      if (!files.length) continue;
      if (signal?.aborted) throw new Error("Indexing cancelled; no snapshot published.");
      try { results.push(await this.adapters[language]({ ...inventory, files }, signal)); }
      catch (error) {
        if (signal?.aborted) throw error;
        results.push({ adapter: { language, status: "unavailable" }, parsed: [], diagnostics: files.map((f) => ({ path: f.path, reason: "adapter-failure", message: error.message })) });
      }
    }
    if (signal?.aborted) throw new Error("Indexing cancelled; no snapshot published.");
    const after = await this.scan(inventory.root, options);
    if (inventory.fingerprint !== after.fingerprint) throw new Error("Repository changed while indexing; no snapshot published.");
    const snapshot = buildSnapshot(inventory, results);
    const history = this.snapshots.get(snapshot.root) ?? [];
    this.snapshots.set(snapshot.root, [snapshot, ...history.filter((s) => s.snapshotId !== snapshot.snapshotId)].slice(0, 2));
    return snapshot;
  }
  async current(root, requireFresh = true) {
    root = await realpath(root);
    const snapshot = this.snapshots.get(root)?.[0];
    if (!snapshot) throw new Error("No index. Run code_index for this repository first.");
    const inventory = await this.scan(root, snapshot.options);
    const fresh = inventory.fingerprint === snapshot.fingerprint;
    if (requireFresh && !fresh) throw new Error("Index is stale. Run code_index before making structural claims.");
    return { snapshot, fresh };
  }
  baseline(root, id) {
    const snapshot = this.snapshots.get(root)?.find((s) => s.snapshotId === id);
    if (!snapshot) throw new Error("Baseline unavailable; retain the latest snapshot ID before editing. Only two snapshots per repository are kept.");
    return snapshot;
  }
}
