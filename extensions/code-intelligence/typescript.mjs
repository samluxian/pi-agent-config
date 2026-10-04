import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { permittedPath } from "./engine.mjs";

const require = createRequire(import.meta.url);
const slash = (path) => path.split(sep).join("/");

// AST parsing and name/module resolution belong to TypeScript, not regexes or the model.
export async function analyzeTypeScript(inventory, signal) {
  let ts;
  try { ts = require("typescript"); }
  catch { throw new Error("TypeScript runtime is missing. Install the declared extension dependencies through the existing workspace initializer."); }
  const root = inventory.root;
  const source = new Map(inventory.files.map((f) => [resolve(root, f.path), f.content]));
  const configs = new Map(inventory.configs.map((f) => [resolve(root, f.path), f.content]));
  const libRoot = realpathSync(dirname(require.resolve("typescript/lib/typescript.js")));
  const inside = (base, path) => {
    const rel = relative(base, path);
    return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
  };
  const allowed = (file) => {
    try {
      const actual = realpathSync(file);
      if (inside(libRoot, actual)) return /\.d\.ts$/.test(actual);
      if (!inside(root, actual)) return false;
      const rel = slash(relative(root, actual));
      // Dependency declarations/package metadata are resolver inputs, not graph nodes.
      if (rel.split("/").includes("node_modules")) {
        return !/(?:secret|credential|\.env|private[-_]?key)/i.test(rel) && (/\.d\.[cm]?ts$/.test(rel) || /(?:^|\/)package\.json$/.test(rel));
      }
      return permittedPath(rel) && (source.has(resolve(file)) || configs.has(resolve(file)));
    } catch { return false; }
  };
  const read = (file) => {
    const full = resolve(file);
    if (!allowed(full)) return undefined;
    return source.get(full) ?? configs.get(full) ?? readFileSync(full, "utf8");
  };
  const fileExists = (file) => allowed(resolve(file)) && existsSync(file);
  const directoryExists = (dir) => {
    try { const actual = realpathSync(dir); return inside(root, actual) || inside(libRoot, actual); }
    catch { return false; }
  };
  // Config file lists are not build membership here. Reuse the inventory instead
  // of traversing arbitrary include/glob paths or symlinked directories.
  const readDirectory = (dir, extensions) => [...source.keys()].filter((file) => inside(resolve(dir), file) && (!extensions || extensions.some((ext) => file.endsWith(ext))));
  const groups = new Map();
  for (const file of inventory.files) {
    let dir = dirname(resolve(root, file.path));
    let config;
    while (inside(root, dir)) {
      config = [join(dir, "tsconfig.json"), join(dir, "jsconfig.json")].find((p) => configs.has(p));
      if (config || dir === root) break;
      dir = dirname(dir);
    }
    const key = config ?? "<default>";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  const parsed = [];
  const projects = [];
  const symbols = new Map();
  const edges = [];
  const diagnostics = [];
  const positions = (sf, pos) => {
    const location = sf.getLineAndCharacterOfPosition(pos);
    return { line: location.line + 1, column: location.character + 1 };
  };
  const nodeId = (node) => {
    const sf = node.getSourceFile();
    const path = slash(relative(root, sf.fileName));
    return `${path}#${node.getStart(sf)}`;
  };
  const definition = (symbol) => {
    if (!symbol) return undefined;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      try { symbol = checker.getAliasedSymbol(symbol); } catch { return undefined; }
    }
    const declarations = symbol.getDeclarations() ?? [];
    return declarations.find((d) => source.has(resolve(d.getSourceFile().fileName))) ?? declarations[0];
  };
  let checker;
  for (const [configPath, files] of groups) {
    if (signal?.aborted) throw new Error("Indexing cancelled.");
    let options = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
    if (configPath !== "<default>") {
      const config = ts.readConfigFile(configPath, read);
      if (config.error) diagnostics.push({ path: slash(relative(root, configPath)), reason: "config-error", message: ts.flattenDiagnosticMessageText(config.error.messageText, "\n") });
      if (config.config) {
        const result = ts.parseJsonConfigFileContent(config.config, { useCaseSensitiveFileNames: true, readDirectory, fileExists, readFile: read }, dirname(configPath));
        options = result.options;
        for (const error of result.errors) diagnostics.push({ path: slash(relative(root, configPath)), reason: "config-error", code: error.code, message: ts.flattenDiagnosticMessageText(error.messageText, "\n") });
      }
    }
    projects.push({ configuration: configPath === "<default>" ? "<default NodeNext>" : slash(relative(root, configPath)), sourceFiles: files.length, membership: "all-inventoried-source-not-build-membership" });
    // Include JS in the structural map even where a project's normal build excludes it.
    options = { ...options, allowJs: true, noEmit: true, incremental: false, composite: false };
    const host = ts.createCompilerHost(options, true);
    Object.assign(host, { readFile: read, fileExists, directoryExists, readDirectory, getDirectories: (dir) => directoryExists(dir) ? ts.sys.getDirectories(dir).filter((name) => directoryExists(isAbsolute(name) ? name : join(dir, name))) : [], getCurrentDirectory: () => root, writeFile: () => { throw new Error("Code intelligence never emits compiler output."); } });
    host.getSourceFile = (file, languageVersion) => {
      const content = read(file);
      return content === undefined ? undefined : ts.createSourceFile(file, content, languageVersion, true);
    };
    const program = ts.createProgram(files.map((f) => resolve(root, f.path)), options, host);
    checker = program.getTypeChecker();
    for (const error of [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()]) {
      diagnostics.push({ reason: "compiler-environment", code: error.code, message: ts.flattenDiagnosticMessageText(error.messageText, "\n") });
    }
    for (const file of files) {
      const sf = program.getSourceFile(resolve(root, file.path));
      if (!sf) { diagnostics.push({ path: file.path, reason: "not-in-program" }); continue; }
      const syntax = program.getSyntacticDiagnostics(sf);
      if (!syntax.length) parsed.push(file.path);
      for (const error of [...syntax, ...program.getSemanticDiagnostics(sf)]) {
        diagnostics.push({ path: file.path, reason: syntax.includes(error) ? "syntax-error" : "semantic-diagnostic", code: error.code, ...positions(sf, error.start ?? 0), message: ts.flattenDiagnosticMessageText(error.messageText, "\n") });
      }
      if (syntax.length) continue; // Recovered ASTs are not published as proven structure.
      const declarationName = (node) => {
        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node) || ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) {
          return node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name : undefined;
        }
        return undefined;
      };
      const collect = (node) => {
        const name = declarationName(node);
        if (name) symbols.set(nodeId(node), { id: nodeId(node), path: file.path, name: name.text, kind: ts.SyntaxKind[node.kind], ...positions(sf, name.getStart(sf)) });
        ts.forEachChild(node, collect);
      };
      collect(sf);
      const relationship = (kind, node, specifier) => {
        if (specifier === undefined) {
          edges.push({ kind, source: file.path, ...positions(sf, node.getStart(sf)), status: "unresolved", reason: "dynamic-module-specifier" });
          return;
        }
        const module = ts.resolveModuleName(specifier, sf.fileName, options, host).resolvedModule;
        const target = module && slash(relative(root, module.resolvedFileName));
        edges.push({ kind, source: file.path, specifier, ...positions(sf, node.getStart(sf)),
          ...(module ? source.has(resolve(module.resolvedFileName)) ? { target, status: "resolved" } : { status: "external", reason: "outside-indexed-source" } : { status: "unresolved", reason: "module-not-resolved" }) });
      };
      const walk = (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier) relationship(ts.isImportDeclaration(node) ? "IMPORTS" : "EXPORTS", node, ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined);
        } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
          const expr = node.moduleReference.expression;
          relationship("IMPORTS", node, expr && ts.isStringLiteralLike(expr) ? expr.text : undefined);
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0];
          relationship("IMPORTS", node, arg && ts.isStringLiteralLike(arg) ? arg.text : undefined);
        } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
          const loader = checker.getSymbolAtLocation(node.expression);
          const declarations = loader?.getDeclarations() ?? [];
          const nodeLoader = declarations.some((d) => slash(d.getSourceFile().fileName).includes("/node_modules/@types/node/"));
          if (nodeLoader) {
            const arg = node.arguments[0];
            relationship("IMPORTS", node, arg && ts.isStringLiteralLike(arg) ? arg.text : undefined);
          } else if (!declarations.some((d) => source.has(resolve(d.getSourceFile().fileName)))) {
            edges.push({ kind: "IMPORTS", source: file.path, ...positions(sf, node.getStart(sf)), status: "unresolved", reason: "commonjs-loader-not-established" });
          }
        }
        if (ts.isIdentifier(node)) {
          const parent = node.parent;
          const ownName = declarationName(parent);
          if (node !== ownName && !(ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isExportSpecifier(parent)) && !(ts.isPropertyAssignment(parent) && parent.name === node && !ts.isShorthandPropertyAssignment(parent))) {
            const symbol = checker.getSymbolAtLocation(node);
            const def = definition(symbol);
            const defPath = def && slash(relative(root, def.getSourceFile().fileName));
            if (def && source.has(resolve(def.getSourceFile().fileName))) {
              if (program.getSyntacticDiagnostics(def.getSourceFile()).length) {
                edges.push({ kind: "REFERENCES", source: file.path, name: node.text, ...positions(sf, node.getStart(sf)), status: "unresolved", reason: "target-parse-failed" });
              } else {
                const id = nodeId(def);
                if (!symbols.has(id)) symbols.set(id, { id, path: defPath, name: def.name?.text ?? symbol?.name ?? node.text, kind: ts.SyntaxKind[def.kind], ...positions(def.getSourceFile(), def.getStart()) });
                edges.push({ kind: "REFERENCES", source: file.path, target: id, targetPath: defPath, name: node.text, ...positions(sf, node.getStart(sf)), targetLine: positions(def.getSourceFile(), def.getStart()).line, status: "resolved" });
              }
            } else if (def) {
              edges.push({ kind: "REFERENCES", source: file.path, name: node.text, ...positions(sf, node.getStart(sf)), status: "external", reason: "outside-indexed-source" });
            } else {
              edges.push({ kind: "REFERENCES", source: file.path, name: node.text, ...positions(sf, node.getStart(sf)), status: "unresolved", reason: "symbol-not-resolved" });
            }
          }
        }
        ts.forEachChild(node, walk);
      };
      walk(sf);
    }
  }
  return { adapter: { language: "javascript/typescript", engine: "TypeScript Compiler API", version: ts.version, status: "available", projects, limitations: ["No complete dynamic-call graph.", "Project roots include all discovered JS/TS source; this is not a build-equivalence check.", "Only inventoried configuration and safe dependency declarations are read."] }, parsed, symbols: [...symbols.values()], edges, diagnostics };
}
