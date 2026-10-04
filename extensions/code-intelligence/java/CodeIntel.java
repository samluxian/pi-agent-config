import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;
import javax.lang.model.element.*;
import javax.lang.model.type.TypeKind;
import javax.tools.*;

// Uses javac's public parser and attribution APIs. No regex-based Java parser,
// application execution, annotation processing, build invocation, or class emission.
class CodeIntel {
    static final List<Map<String, Object>> symbols = new ArrayList<>();
    static final List<Map<String, Object>> edges = new ArrayList<>();
    static final List<Map<String, Object>> diagnostics = new ArrayList<>();
    static final Set<String> sourcePaths = new HashSet<>();
    static final Set<String> parsedPaths = new HashSet<>();
    static Path root;
    static Trees trees;
    static SourcePositions positions;

    static class Source extends SimpleJavaFileObject {
        final String content;
        Source(String path, String text) { super(root.resolve(path).toUri(), Kind.SOURCE); content = text; }
        public CharSequence getCharContent(boolean ignoreEncodingErrors) { return content; }
    }

    static Map<String, Object> obj(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) result.put(values[i].toString(), values[i + 1]);
        return result;
    }
    static String decode(String text) { return new String(Base64.getDecoder().decode(text), StandardCharsets.UTF_8); }
    static String path(CompilationUnitTree unit) { return root.relativize(Path.of(unit.getSourceFile().toUri())).toString().replace(File.separatorChar, '/'); }
    static long start(CompilationUnitTree unit, Tree tree) { return positions.getStartPosition(unit, tree); }
    static String id(CompilationUnitTree unit, Tree tree) { return path(unit) + "#" + start(unit, tree); }
    static Map<String, Object> location(CompilationUnitTree unit, Tree tree) {
        long pos = Math.max(0, start(unit, tree));
        return obj("source", path(unit), "line", unit.getLineMap().getLineNumber(pos), "column", unit.getLineMap().getColumnNumber(pos));
    }
    static boolean unresolved(TreePath path) {
        try { return trees.getTypeMirror(path) != null && trees.getTypeMirror(path).getKind() == TypeKind.ERROR; }
        catch (RuntimeException ex) { return true; }
    }

    static class Scanner extends TreePathScanner<Void, Void> {
        final CompilationUnitTree unit;
        Scanner(CompilationUnitTree unit) { this.unit = unit; }
        void declaration(Tree tree, String name, String kind) {
            Map<String, Object> symbol = location(unit, tree);
            symbol.remove("source");
            symbol.putAll(obj("id", id(unit, tree), "path", path(unit), "name", name, "kind", kind));
            symbols.add(symbol);
        }
        public Void visitClass(ClassTree tree, Void p) {
            if (!tree.getSimpleName().toString().isEmpty()) declaration(tree, tree.getSimpleName().toString(), tree.getKind().name());
            return super.visitClass(tree, p);
        }
        public Void visitMethod(MethodTree tree, Void p) {
            // Ignore compiler-synthesized constructors without source positions.
            if (start(unit, tree) < 0 || positions.getEndPosition(unit, tree) < 0) return null;
            declaration(tree, tree.getName().toString(), "METHOD");
            return super.visitMethod(tree, p);
        }
        public Void visitVariable(VariableTree tree, Void p) {
            if (start(unit, tree) >= 0) declaration(tree, tree.getName().toString(), "VARIABLE");
            return super.visitVariable(tree, p);
        }
        void reference(Tree tree, String name, String kind, String specifier) {
            if (start(unit, tree) < 0 || positions.getEndPosition(unit, tree) < 0) return;
            TreePath current = getCurrentPath();
            Element element;
            try { element = trees.getElement(current); } catch (RuntimeException ex) { element = null; }
            Map<String, Object> edge = location(unit, tree);
            edge.put("kind", kind);
            edge.put("name", name);
            if (specifier != null) edge.put("specifier", specifier);
            if (element == null || unresolved(current)) {
                edge.putAll(obj("status", "unresolved", "reason", "symbol-not-resolved"));
            } else {
                TreePath declaration;
                try { declaration = trees.getPath(element); } catch (RuntimeException ex) { declaration = null; }
                if (declaration != null && sourcePaths.contains(path(declaration.getCompilationUnit()))) {
                    CompilationUnitTree destination = declaration.getCompilationUnit();
                    if (!parsedPaths.contains(path(destination))) {
                        edge.putAll(obj("status", "unresolved", "reason", "target-parse-failed"));
                        edges.add(edge);
                        return;
                    }
                    edge.putAll(obj("status", "resolved", "target", kind.equals("IMPORTS") ? path(destination) : id(destination, declaration.getLeaf()), "targetPath", path(destination), "targetLine", destination.getLineMap().getLineNumber(Math.max(0, start(destination, declaration.getLeaf())))));
                } else {
                    edge.putAll(obj("status", "external", "reason", "outside-indexed-source"));
                }
            }
            edges.add(edge);
        }
        public Void visitIdentifier(IdentifierTree tree, Void p) {
            Tree parent = getCurrentPath().getParentPath() == null ? null : getCurrentPath().getParentPath().getLeaf();
            if (!(parent instanceof ImportTree)) reference(tree, tree.getName().toString(), "REFERENCES", null);
            return super.visitIdentifier(tree, p);
        }
        public Void visitMemberSelect(MemberSelectTree tree, Void p) {
            Tree parent = getCurrentPath().getParentPath() == null ? null : getCurrentPath().getParentPath().getLeaf();
            if (parent instanceof ImportTree) {
                if (tree.getIdentifier().contentEquals("*")) {
                    Map<String, Object> edge = location(unit, tree);
                    edge.putAll(obj("kind", "IMPORTS", "specifier", tree.toString(), "status", "unresolved", "reason", "wildcard-import-not-expanded"));
                    edges.add(edge);
                } else reference(tree, tree.toString(), "IMPORTS", tree.toString());
                return null; // No invented package/member edges from the import's text.
            }
            reference(tree, tree.getIdentifier().toString(), "REFERENCES", null);
            return super.visitMemberSelect(tree, p);
        }
    }

    static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map<?, ?> map) {
            List<String> entries = new ArrayList<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) entries.add(json(entry.getKey().toString()) + ":" + json(entry.getValue()));
            return "{" + String.join(",", entries) + "}";
        }
        if (value instanceof Iterable<?> items) {
            List<String> entries = new ArrayList<>();
            for (Object item : items) entries.add(json(item));
            return "[" + String.join(",", entries) + "]";
        }
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toString().toCharArray()) {
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default: if (c < 32) out.append(String.format("\\u%04x", (int)c)); else out.append(c);
            }
        }
        return out.append('"').toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        root = Path.of(decode(input.readLine()));
        String classpath = decode(input.readLine());
        List<JavaFileObject> sources = new ArrayList<>();
        for (String line; (line = input.readLine()) != null;) {
            String[] fields = line.split("\\t", -1);
            String path = decode(fields[0]);
            sourcePaths.add(path);
            sources.add(new Source(path, decode(fields[1])));
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("Full JDK required");
        DiagnosticCollector<JavaFileObject> collector = new DiagnosticCollector<>();
        List<String> parsed = new ArrayList<>();
        try (StandardJavaFileManager manager = compiler.getStandardFileManager(collector, Locale.ROOT, StandardCharsets.UTF_8)) {
            // Empty classpath means no implicit current-directory or environment input.
            manager.setLocationFromPaths(StandardLocation.CLASS_PATH, classpath.isEmpty() ? List.of() : Arrays.stream(classpath.split(java.util.regex.Pattern.quote(File.pathSeparator))).map(Path::of).toList());
            manager.setLocationFromPaths(StandardLocation.SOURCE_PATH, List.of());
            JavacTask task = (JavacTask) compiler.getTask(new StringWriter(), manager, collector, List.of("-proc:none", "-implicit:none"), null, sources);
            List<CompilationUnitTree> units = new ArrayList<>();
            for (CompilationUnitTree unit : task.parse()) units.add(unit);
            Set<URI> syntaxFailed = new HashSet<>();
            for (Diagnostic<? extends JavaFileObject> d : collector.getDiagnostics()) {
                if (d.getKind() == Diagnostic.Kind.ERROR && d.getSource() != null) syntaxFailed.add(d.getSource().toUri());
            }
            for (CompilationUnitTree unit : units) if (!syntaxFailed.contains(unit.getSourceFile().toUri())) parsed.add(path(unit));
            try { task.analyze(); }
            catch (RuntimeException ex) { diagnostics.add(obj("reason", "attribution-incomplete", "message", "Java compiler attribution did not complete.")); }
            trees = Trees.instance(task);
            positions = trees.getSourcePositions();
            parsedPaths.addAll(parsed);
            for (CompilationUnitTree unit : units) if (parsedPaths.contains(path(unit))) new Scanner(unit).scan(unit, null);
            for (Diagnostic<? extends JavaFileObject> d : collector.getDiagnostics()) {
                Map<String, Object> diagnostic = obj("reason", d.getSource() != null && syntaxFailed.contains(d.getSource().toUri()) ? "syntax-error" : "semantic-diagnostic", "code", d.getCode(), "severity", d.getKind().name(), "line", d.getLineNumber(), "column", d.getColumnNumber());
                if (d.getSource() != null) diagnostic.put("path", root.relativize(Path.of(d.getSource().toUri())).toString().replace(File.separatorChar, '/'));
                diagnostics.add(diagnostic);
            }
        }
        System.out.println(json(obj("adapter", obj("language", "java", "engine", "JDK javac public compiler API", "version", System.getProperty("java.version"), "status", "available", "limitations", List.of("All indexed Java sources share one compiler task, not actual Maven/Gradle source sets or modulepath.", "No build execution, annotation processing, or generated sources.", "Only explicit repository-local JARs are classpath inputs.", "Wildcard imports are recorded as unresolved, not guessed.")), "parsed", parsed, "symbols", symbols, "edges", edges, "diagnostics", diagnostics)));
    }
}
