import { Buffer } from "node:buffer";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { FileHandle } from "node:fs/promises";
import type { ProcessorInput, ProcessorOutput, ProcessorRequest, SupportedProcessor } from "./types.ts";
import { MAX_PROCESSOR_INPUT_BYTES, openSafeBashOutput } from "./policy.ts";
import { summarizeTestResult } from "./test-results.ts";

const PROCESSOR_TIMEOUT_MS = 5_000;
const MAX_PROCESSOR_STDOUT_BYTES = 2 * 1024 * 1024;
const MAX_PROCESSOR_STDERR_BYTES = 16 * 1024;

const PROCESSORS: Record<Exclude<SupportedProcessor, "test-result">, { path: string; args: string[]; schema: string }> = {
	"terraform-plan": {
		path: ".agents/skills/terraform-repository-maintenance/scripts/summarize_terraform_plan.py",
		args: ["--json"],
		schema: "terraform-plan-summary/v1",
	},
	"helm-manifest": {
		path: ".agents/skills/gitops-state-diagnostics/scripts/summarize_manifest_json.py",
		args: ["--helm-output"],
		schema: "gitops-summary/v1",
	},
};

async function findProcessor(relativePath: string): Promise<string | undefined> {
	const extensionDirectory = dirname(fileURLToPath(import.meta.url));
	const roots = [resolve(extensionDirectory, "../.."), resolve(extensionDirectory, "../../..")];
	for (const root of roots) {
		const candidate = join(root, relativePath);
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Try the installed-workspace layout after the source-repository layout.
		}
	}
	return undefined;
}

function appendBounded(chunks: Buffer[], chunk: Buffer, currentBytes: number, limit: number): number {
	if (currentBytes >= limit) return currentBytes + chunk.length;
	const remaining = limit - currentBytes;
	chunks.push(chunk.subarray(0, remaining));
	return currentBytes + chunk.length;
}

async function executeProcessor(
	input: ProcessorInput,
	script: string,
	args: string[],
	signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string } | undefined> {
	let handle: FileHandle | undefined;
	if (input.type === "file") {
		handle = await openSafeBashOutput(input.path);
		if (!handle) return undefined;
	} else if (Buffer.byteLength(input.text, "utf8") > MAX_PROCESSOR_INPUT_BYTES) {
		return undefined;
	}

	try {
		return await new Promise((resolveResult) => {
			let settled = false;
			let cancelled = false;
			let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
			let finalTimer: ReturnType<typeof setTimeout> | undefined;
			let stdoutBytes = 0;
			let stderrBytes = 0;
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			let child: ReturnType<typeof spawn>;
			try {
				child = spawn("python3", [script, ...args], {
					stdio: [input.type === "file" ? handle!.fd : "pipe", "pipe", "pipe"],
					windowsHide: true,
				});
			} catch {
				resolveResult(undefined);
				return;
			}

			const finish = (result: { stdout: string; stderr: string } | undefined) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				if (forceKillTimer) clearTimeout(forceKillTimer);
				if (finalTimer) clearTimeout(finalTimer);
				signal?.removeEventListener("abort", cancel);
				resolveResult(result);
			};
			const cancel = () => {
				if (cancelled) return;
				cancelled = true;
				child.kill("SIGTERM");
				forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 250);
				finalTimer = setTimeout(() => finish(undefined), 1_000);
			};
			const timer = setTimeout(cancel, PROCESSOR_TIMEOUT_MS);

			child.stdout?.on("data", (chunk: Buffer) => {
				stdoutBytes = appendBounded(stdout, chunk, stdoutBytes, MAX_PROCESSOR_STDOUT_BYTES);
				if (stdoutBytes > MAX_PROCESSOR_STDOUT_BYTES) cancel();
			});
			child.stderr?.on("data", (chunk: Buffer) => {
				stderrBytes = appendBounded(stderr, chunk, stderrBytes, MAX_PROCESSOR_STDERR_BYTES);
			});
			child.on("error", () => finish(undefined));
			child.on("close", (code) => {
				if (cancelled || code !== 0 || stdoutBytes > MAX_PROCESSOR_STDOUT_BYTES) {
					finish(undefined);
					return;
				}
				finish({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
			});
			signal?.addEventListener("abort", cancel, { once: true });
			if (input.type === "text") {
				child.stdin?.on("error", () => undefined);
				child.stdin?.end(input.text);
			}
			if (signal?.aborted) cancel();
		});
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

async function readTestInput(input: ProcessorInput): Promise<string | undefined> {
	if (input.type === "text") {
		return Buffer.byteLength(input.text, "utf8") <= MAX_PROCESSOR_INPUT_BYTES ? input.text : undefined;
	}
	const handle = await openSafeBashOutput(input.path);
	if (!handle) return undefined;
	try {
		return await handle.readFile({ encoding: "utf8" });
	} catch {
		return undefined;
	} finally {
		await handle.close().catch(() => undefined);
	}
}

export async function runProcessor(request: ProcessorRequest): Promise<ProcessorOutput | undefined> {
	if (request.signal?.aborted) return undefined;
	if (request.kind === "test-result") {
		const input = await readTestInput(request.input);
		if (input === undefined || request.signal?.aborted) return undefined;
		const output = summarizeTestResult(input, request.inputComplete, request.commandFailed);
		return output ? { kind: request.kind, text: output.text, complete: output.complete } : undefined;
	}

	const definition = PROCESSORS[request.kind];
	const script = await findProcessor(definition.path);
	if (!script) return undefined;
	const result = await executeProcessor(request.input, script, definition.args, request.signal);
	if (!result?.stdout.trim()) return undefined;
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(result.stdout) as Record<string, unknown>;
	} catch {
		return undefined;
	}
	if (parsed.schema_version !== definition.schema || parsed.complete !== true) return undefined;
	return { kind: request.kind, text: JSON.stringify(parsed, null, 2), complete: true };
}
