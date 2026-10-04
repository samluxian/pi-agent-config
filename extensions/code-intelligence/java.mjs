import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("./java/CodeIntel.java", import.meta.url));
const encoded = (value) => Buffer.from(value).toString("base64");

export function runCompiler(input, root, signal, { spawnProcess = spawn, timeoutMs = 60000, outputLimit = 32 * 1024 * 1024, graceMs = 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess("java", ["--source", "17", helper], { cwd: root, stdio: ["pipe", "pipe", "pipe"], signal });
    const decoder = new StringDecoder("utf8");
    let output = "";
    let bytes = 0;
    let failure;
    let escalation;
    const stop = (error) => {
      if (failure) return;
      failure = error;
      child.stdin.destroy();
      child.kill("SIGTERM");
      escalation = setTimeout(() => child.kill("SIGKILL"), graceMs);
    };
    const timer = setTimeout(() => stop(new Error("Java compiler analysis exceeded its time budget.")), timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (failure) return; // Drain without retaining further output while terminating.
      bytes += chunk.length;
      if (bytes > outputLimit) stop(new Error("Java evidence exceeded its output budget."));
      else output += decoder.write(chunk);
    });
    // Never return raw launcher stderr/source excerpts. Compiler diagnostics are
    // separately emitted as codes, severity and locations by the helper.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      if (error.code === "ABORT_ERR") stop(new Error("Java indexing cancelled."));
      else failure ??= new Error(error.code === "ENOENT" ? "Java analysis requires JDK 17 or newer; java is not available." : "Java compiler process could not start.");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearTimeout(escalation);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error("Java analysis failed. A full JDK 17+ with the jdk.compiler module is required; no build or annotation processors are executed."));
      try { resolve(JSON.parse(output + decoder.end())); }
      catch { reject(new Error("Java adapter returned an invalid evidence protocol.")); }
    });
    child.stdin.end(input);
  });
}

export async function analyzeJava(inventory, signal) {
  const input = [encoded(inventory.root), encoded(inventory.classpath.map((c) => join(inventory.root, c.path)).join(delimiter)),
    ...inventory.files.map((f) => `${encoded(f.path)}\t${encoded(f.content)}`)].join("\n") + "\n";
  return runCompiler(input, inventory.root, signal);
}
