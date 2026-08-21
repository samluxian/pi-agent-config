/**
 * Minimal subagents extension.
 *
 * Registers a single `subagent` tool with bounded evidence agents, an
 * execution-capable reviewer, and one approval-gated editing worker.
 * Supports single and bounded parallel evidence execution with verbal output only.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme, parseFrontmatter, truncateHead, withFileMutationQueue, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Container, Markdown, Spacer, Text, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ── Types ──────────────────────────────────────────────────────────────

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	model: string;
	thinking: ThinkingLevel;
	systemPrompt: string;
	filePath: string;
	subagentAgents?: string[];
}

interface ToolEvent {
	toolCallId: string;
	tool: string;
	args: string;
}

interface AgentProgress {
	agent: string;
	status: "pending" | "running" | "completed" | "failed";
	task: string;
	currentTool?: string;
	currentToolArgs?: string;
	recentTools: ToolEvent[];
	toolCount: number;
	tokens: number;
	durationMs: number;
	timeoutMs?: number;
	timedOut?: boolean;
	lastMessage: string;
	error?: string;
}

export type ReviewerVerdict = "pass" | "fail" | "blocked" | "missing";
export type ReviewMode = "partial" | "final";

interface AgentResult {
	agent: string;
	task: string;
	output: string;
	exitCode: number;
	progress: AgentProgress;
	model?: string;
	reviewVerdict?: ReviewerVerdict;
	reviewMode?: ReviewMode;
	usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number };
}

interface Details {
	mode: "single" | "parallel";
	results: AgentResult[];
}

// ── Config ─────────────────────────────────────────────────────────────

interface ExtensionConfig {
	maxConcurrency: number;
}

const EXT_DIR = path.dirname(new URL(import.meta.url).pathname);
const AGENTS_DIR = path.join(EXT_DIR, "agents");
const TOOLS_DIR = path.join(EXT_DIR, "tools");
const CONFIG_PATH = path.join(EXT_DIR, "config.json");
export const DEFAULT_MAX_CONCURRENCY = 4;
export const MAX_SUBAGENT_TASKS = 4;
export const DEFAULT_SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000;
export const WORKER_SUBAGENT_TIMEOUT_MS = 10 * 60 * 1000;
export const REVIEWER_MAX_OUTPUT_BYTES = 16 * 1024;
export const REVIEWER_MAX_OUTPUT_LINES = 160;
const DEFAULT_TERMINATE_GRACE_MS = 3000;
const ALLOWED_AGENT_NAMES = new Set(["scout", "researcher", "environment-scout", "reviewer", "worker"]);
const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export interface ReviewGateState {
	mutationGeneration: number;
	reviewedGeneration: number;
	pending: boolean;
}

export function createReviewGate() {
	let mutationGeneration = 0;
	let reviewedGeneration = 0;

	return {
		markMutation(): number {
			mutationGeneration++;
			return mutationGeneration;
		},
		snapshot(): number {
			return mutationGeneration;
		},
		completeReview(generation: number, success: boolean): boolean {
			if (success && generation === mutationGeneration) reviewedGeneration = generation;
			return reviewedGeneration === mutationGeneration;
		},
		state(): ReviewGateState {
			return {
				mutationGeneration,
				reviewedGeneration,
				pending: reviewedGeneration !== mutationGeneration,
			};
		},
		reset(): void {
			mutationGeneration = 0;
			reviewedGeneration = 0;
		},
	};
}

export interface RepositoryReviewScopeState extends ReviewGateState {
	scope: string;
}

export interface RepositoryReviewGateState {
	pending: boolean;
	scopes: RepositoryReviewScopeState[];
}

export function createRepositoryReviewGate() {
	const gates = new Map<string, ReturnType<typeof createReviewGate>>();

	const gateFor = (scope: string) => {
		let gate = gates.get(scope);
		if (!gate) {
			gate = createReviewGate();
			gates.set(scope, gate);
		}
		return gate;
	};

	return {
		markMutation(scope: string): number {
			return gateFor(scope).markMutation();
		},
		snapshot(scope: string): number {
			return gates.get(scope)?.snapshot() ?? 0;
		},
		completeReview(scope: string, generation: number, success: boolean): boolean {
			const gate = gates.get(scope);
			if (!gate) return true;
			return gate.completeReview(generation, success);
		},
		state(): RepositoryReviewGateState {
			const scopes = [...gates.entries()]
				.map(([scope, gate]) => ({ scope, ...gate.state() }))
				.sort((left, right) => left.scope.localeCompare(right.scope));
			return { pending: scopes.some((entry) => entry.pending), scopes };
		},
		reset(): void {
			gates.clear();
		},
	};
}

function nearestExistingPath(candidate: string): string {
	let current = candidate;
	while (!fs.existsSync(current)) {
		const parent = path.dirname(current);
		if (parent === current) return candidate;
		current = parent;
	}
	try {
		return fs.realpathSync(current);
	} catch {
		return current;
	}
}

export function resolveRepositoryScope(cwd: string, targetPath?: string): string {
	const normalizedTarget = targetPath?.startsWith("@") ? targetPath.slice(1) : targetPath;
	const candidate = normalizedTarget
		? path.resolve(cwd, normalizedTarget)
		: path.resolve(cwd);
	let current = nearestExistingPath(candidate);
	try {
		if (fs.statSync(current).isFile()) current = path.dirname(current);
	} catch {}

	while (true) {
		if (fs.existsSync(path.join(current, ".git"))) return current;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return nearestExistingPath(path.resolve(cwd));
}

export function parseReviewerVerdict(output: string): ReviewerVerdict {
	const match = output.match(/^## Verdict\s*\r?\n\s*-\s*`?(pass|fail|blocked)`?/im);
	return (match?.[1]?.toLowerCase() as ReviewerVerdict | undefined) ?? "missing";
}

export function reviewerResultPassed(result: Pick<AgentResult, "exitCode" | "progress" | "reviewVerdict">): boolean {
	return result.exitCode === 0 && !result.progress.error && result.reviewVerdict === "pass";
}

export function createExecutionGate() {
	let active = 0;
	let exclusiveRole: "reviewer" | "worker" | undefined;

	return {
		enter(role?: "reviewer" | "worker"): (() => void) | undefined {
			if (exclusiveRole || (role && active > 0)) return undefined;
			active++;
			if (role) exclusiveRole = role;
			let released = false;
			return () => {
				if (released) return;
				released = true;
				active--;
				if (role) exclusiveRole = undefined;
			};
		},
		state() {
			return { active, exclusiveRole };
		},
	};
}

export function normalizeConfig(value: unknown): ExtensionConfig {
	const raw = value && typeof value === "object"
		? (value as { maxConcurrency?: unknown }).maxConcurrency
		: undefined;
	const parsed = typeof raw === "number" && Number.isFinite(raw)
		? Math.trunc(raw)
		: DEFAULT_MAX_CONCURRENCY;
	return { maxConcurrency: Math.max(1, Math.min(MAX_SUBAGENT_TASKS, parsed)) };
}

function loadConfig(): ExtensionConfig {
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")));
		}
	} catch {}
	return normalizeConfig(undefined);
}

// Built-in tools that pi provides natively (no extension needed)
const BUILTIN_TOOLS = new Set(["read", "write", "edit", "grep", "find", "ls"]);

// Custom tools are resolved relative to this package, not a global Pi config.
const WEB_ACCESS_EXTENSION = path.join(
	EXT_DIR,
	"..",
	"..",
	"npm",
	"node_modules",
	"pi-web-access",
	"index.ts",
);
const CUSTOM_TOOL_EXTENSIONS: Record<string, string> = {
	web_search: WEB_ACCESS_EXTENSION,
	fetch_content: WEB_ACCESS_EXTENSION,
	kubectl_inspect: path.join(TOOLS_DIR, "environment-inspect.ts"),
	gcloud_inspect: path.join(TOOLS_DIR, "environment-inspect.ts"),
	safe_bash: path.join(TOOLS_DIR, "safe-bash.ts"),
	subagent: path.join(EXT_DIR, "index.ts"),
};

// ── Agent Discovery & Registration ────────────────────────────────────

export function loadAgents(agentDir = AGENTS_DIR): AgentConfig[] {
	const loaded: AgentConfig[] = [];
	if (!fs.existsSync(agentDir)) return loaded;
	for (const entry of fs.readdirSync(agentDir)) {
		if (!entry.endsWith(".md")) continue;
		const filePath = path.join(agentDir, entry);
		const content = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		const name = frontmatter.name;
		const thinking = frontmatter.thinking as ThinkingLevel | undefined;
		const tools = (frontmatter.tools || "")
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		const subagentAgents = frontmatter.subagent_agents
			? frontmatter.subagent_agents.split(",").map((t) => t.trim()).filter(Boolean)
			: undefined;

		if (!name || !frontmatter.description || !frontmatter.model || !thinking || !THINKING_LEVELS.has(thinking)) {
			throw new Error(`Invalid subagent profile: ${filePath}. name, description, model, and thinking are required.`);
		}
		if (!ALLOWED_AGENT_NAMES.has(name)) {
			throw new Error(`Unsupported subagent profile: ${name}. Allowed agents: scout, researcher, environment-scout, reviewer, worker.`);
		}
		if (loaded.some((agent) => agent.name === name)) {
			throw new Error(`Duplicate subagent profile: ${name}`);
		}

		loaded.push({
			name,
			description: frontmatter.description,
			tools,
			model: frontmatter.model,
			thinking,
			systemPrompt: body,
			filePath,
			...(subagentAgents ? { subagentAgents } : {}),
		});
	}
	return loaded;
}

// ── Pi Binary Resolution ──────────────────────────────────────────────

function resolvePiBinary(): { command: string; baseArgs: string[] } {
	// Resolve the pi entry point from process.argv[1]
	const entry = process.argv[1];
	if (entry) {
		try {
			const realEntry = fs.realpathSync(entry);
			if (/\.(?:mjs|cjs|js)$/i.test(realEntry)) {
				return { command: process.execPath, baseArgs: [realEntry] };
			}
		} catch {}
	}
	return { command: "pi", baseArgs: [] };
}

// ── Formatting Utilities ──────────────────────────────────────────────

function formatTokens(n: number): string {
	return n < 1000 ? String(n) : n < 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function formatToolPreview(name: string, args: Record<string, unknown>): string {
	switch (name) {
		case "bash":
		case "safe_bash":
			return `$ ${((args.command as string) || "").slice(0, 80)}`;
		case "read":
			return `read ${(args.path as string) || ""}`;
		case "write":
			return `write ${(args.path as string) || ""}`;
		case "edit":
			return `edit ${(args.path as string) || ""}`;
		case "grep":
			return `grep ${(args.pattern as string) || ""}`;
		case "find":
			return `find ${(args.pattern as string) || ""}`;
		case "ls":
			return `ls ${(args.path as string) || "."}`;
		case "web_search":
			return `search ${((args.query as string) || "").slice(0, 80)}`;
		case "fetch_content":
			return `fetch ${(args.url as string) || ""}`;
		case "kubectl_inspect":
		case "gcloud_inspect":
			return `${name} ${(args.operation as string) || ""}`;
		default: {
			const s = JSON.stringify(args);
			return `${name} ${s.slice(0, 60)}`;
		}
	}
}

function truncLine(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;
	// Simple truncation - strip to fit
	let result = "";
	let width = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		// Skip ANSI escape sequences
		if (ch === "\x1b") {
			const match = text.slice(i).match(/^\x1b\[[0-9;]*m/);
			if (match) {
				result += match[0];
				i += match[0].length - 1;
				continue;
			}
		}
		if (width >= maxWidth - 1) {
			return result + "…";
		}
		result += ch;
		width++;
	}
	return result;
}

// ── Subagent Execution ────────────────────────────────────────────────

export async function buildPiArgs(
	agent: AgentConfig,
	task: string,
	cwd: string,
): Promise<{ args: string[]; tempDir: string; childEnv?: NodeJS.ProcessEnv }> {
	const piBin = resolvePiBinary();
	const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-sub-"));

	// Write system prompt to temp file
	const promptPath = path.join(tempDir, `${agent.name}.md`);
	await withFileMutationQueue(promptPath, async () => {
		await fs.promises.writeFile(promptPath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
	});

	const args = [...piBin.baseArgs, "--mode", "json", "-p", "--no-session", "--no-skills"];

	// --tools is a unified allowlist for built-in and extension tools.
	const allowlist: string[] = [];
	const extensionPaths = new Set<string>();

	for (const tool of agent.tools) {
		if (BUILTIN_TOOLS.has(tool)) {
			allowlist.push(tool);
		} else if (CUSTOM_TOOL_EXTENSIONS[tool]) {
			allowlist.push(tool);
			extensionPaths.add(CUSTOM_TOOL_EXTENSIONS[tool]);
		}
	}

	// Use --no-extensions then add only what the profile needs.
	args.push("--no-extensions");

	if (allowlist.length > 0) {
		args.push("--tools", allowlist.join(","));
	} else {
		args.push("--no-tools");
	}

	for (const extPath of extensionPaths) {
		args.push("--extension", extPath);
	}

	args.push("--model", agent.model);
	args.push("--thinking", agent.thinking);
	args.push("--append-system-prompt", promptPath);

	// Handle long tasks by writing to file
	const TASK_LIMIT = 8000;
	if (task.length > TASK_LIMIT) {
		const taskPath = path.join(tempDir, "task.md");
		await withFileMutationQueue(taskPath, async () => {
			await fs.promises.writeFile(taskPath, `Task: ${task}`, { encoding: "utf-8", mode: 0o600 });
		});
		args.push(`@${taskPath}`);
	} else {
		args.push(`Task: ${task}`);
	}

	const childEnv = agent.tools.includes("subagent") && agent.subagentAgents?.length
		? { ...process.env, PI_SUBAGENT_ALLOWED: agent.subagentAgents.join(",") }
		: undefined;

	return { args: [piBin.command, ...args], tempDir, childEnv };
}

function extractTextFromContent(content: unknown): string {
	if (!content) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n");
	}
	return "";
}

function extractToolArgsPreview(args: Record<string, unknown>): string {
	if (args.command) return String(args.command).slice(0, 100);
	if (args.path) return String(args.path);
	if (args.query) return `"${String(args.query).slice(0, 80)}"`;
	if (args.url) return String(args.url);
	if (args.pattern) return String(args.pattern);
	const s = JSON.stringify(args);
	return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

export async function runSubagent(
	agent: AgentConfig,
	task: string,
	cwd: string,
	signal: AbortSignal | undefined,
	onUpdate?: (progress: AgentProgress) => void,
	options: {
		timeoutMs?: number;
		terminateGraceMs?: number;
		spawnProcess?: typeof spawn;
	} = {},
): Promise<AgentResult> {
	const { args, tempDir, childEnv } = await buildPiArgs(agent, task, cwd);
	const command = args[0];
	const spawnArgs = args.slice(1);

	const result: AgentResult = {
		agent: agent.name,
		task,
		output: "",
		exitCode: 0,
		model: agent.model,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		progress: {
			agent: agent.name,
			status: "running",
			task,
			recentTools: [],
			toolCount: 0,
			tokens: 0,
			durationMs: 0,
			lastMessage: "",
		},
	};

	const startTime = Date.now();
	const progress = result.progress;

	const fireUpdate = throttle(() => {
		progress.durationMs = Date.now() - startTime;
		onUpdate?.(progress);
	}, 150);

	const defaultTimeoutMs = agent.name === "worker"
		? WORKER_SUBAGENT_TIMEOUT_MS
		: DEFAULT_SUBAGENT_TIMEOUT_MS;
	const timeoutMs = Math.max(1, options.timeoutMs ?? defaultTimeoutMs);
	progress.timeoutMs = timeoutMs;
	const terminateGraceMs = Math.max(0, options.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS);
	const spawnProcess = options.spawnProcess ?? spawn;
	const workerReviewGate = createReviewGate();
	const activeToolCalls = new Map<string, {
		toolName: string;
		args: Record<string, unknown>;
		reviewGeneration?: number;
	}>();
	let exitCode = 1;

	try {
		exitCode = await new Promise<number>((resolve) => {
			const proc = spawnProcess(command, spawnArgs, {
				cwd,
				stdio: ["ignore", "pipe", "pipe"],
				...(childEnv ? { env: childEnv } : {}),
			});

			let buf = "";
			let stderrBuf = "";
			let closed = false;
			let terminating = false;
			let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
			let terminateTimer: ReturnType<typeof setTimeout> | undefined;
			let abortHandler: (() => void) | undefined;

			const finish = (code: number) => {
				if (closed) return;
				closed = true;
				if (timeoutTimer) clearTimeout(timeoutTimer);
				if (terminateTimer) clearTimeout(terminateTimer);
				if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
				resolve(code);
			};

			const terminate = (reason: string) => {
				if (closed || terminating) return;
				terminating = true;
				if (!progress.error) progress.error = reason;
				try {
					proc.kill("SIGTERM");
				} catch {}
				terminateTimer = setTimeout(() => {
					if (closed) return;
					try {
						proc.kill("SIGKILL");
					} catch {}
				}, terminateGraceMs);
			};

		const processLine = (line: string) => {
			if (!line.trim()) return;
			try {
				const evt = JSON.parse(line) as any;
				progress.durationMs = Date.now() - startTime;

				if (evt.type === "tool_execution_start") {
					const args = (evt.args || {}) as Record<string, unknown>;
					const toolCallId = String(evt.toolCallId ?? "");
					activeToolCalls.set(toolCallId, {
						toolName: evt.toolName,
						args,
						...(evt.toolName === "subagent" && args.agent === "reviewer"
							? { reviewGeneration: workerReviewGate.snapshot() }
							: {}),
					});
					progress.toolCount++;
					progress.currentTool = evt.toolName;
					progress.currentToolArgs = extractToolArgsPreview(args);
					fireUpdate();
				}

				if (evt.type === "tool_execution_end") {
					const toolCallId = String(evt.toolCallId ?? "");
					const call = activeToolCalls.get(toolCallId);
					if (call && !evt.isError && (call.toolName === "edit" || call.toolName === "write" || call.toolName === "safe_bash")) {
						workerReviewGate.markMutation();
					}
					if (call?.toolName === "subagent" && call.args.agent === "reviewer") {
						const nestedResults = evt.result?.details?.results;
						const nestedResult = Array.isArray(nestedResults) && nestedResults.length === 1
							? nestedResults[0]
							: undefined;
						const succeeded = !evt.isError
							&& call.args.reviewMode !== "partial"
							&& nestedResult
							&& reviewerResultPassed(nestedResult);
						workerReviewGate.completeReview(call.reviewGeneration ?? -1, Boolean(succeeded));
					}
					activeToolCalls.delete(toolCallId);

					if (call) {
						progress.recentTools.push({
							toolCallId,
							tool: call.toolName,
							args: extractToolArgsPreview(call.args),
						});
						// Keep last 20
						if (progress.recentTools.length > 20) {
							progress.recentTools.splice(0, progress.recentTools.length - 20);
						}
					}
					const remainingCall = Array.from(activeToolCalls.values()).at(-1);
					progress.currentTool = remainingCall?.toolName;
					progress.currentToolArgs = remainingCall
						? extractToolArgsPreview(remainingCall.args)
						: undefined;
					fireUpdate();
				}

				if (evt.type === "tool_result_end") {
					fireUpdate();
				}

				if (evt.type === "message_end" && evt.message) {
					if (evt.message.role === "assistant") {
						result.usage.turns++;
						const u = evt.message.usage;
						if (u) {
							result.usage.input += u.input || 0;
							result.usage.output += u.output || 0;
							result.usage.cacheRead += u.cacheRead || 0;
							result.usage.cacheWrite += u.cacheWrite || 0;
							result.usage.cost += u.cost?.total || 0;
							progress.tokens = result.usage.input + result.usage.output;
						}
						if (evt.message.model) result.model = evt.message.model;
						if (evt.message.errorMessage) progress.error = evt.message.errorMessage;

						const text = extractTextFromContent(evt.message.content);
						if (text) {
							result.output = text;
							// Extract just the prose "thinking" text — skip code blocks
							const proseLines: string[] = [];
							let inCodeBlock = false;
							for (const line of text.split("\n")) {
								if (line.trimStart().startsWith("```")) {
									inCodeBlock = !inCodeBlock;
									continue;
								}
								if (!inCodeBlock && line.trim()) {
									proseLines.push(line.trim());
								}
							}
							if (proseLines.length > 0) {
								progress.lastMessage = proseLines.slice(0, 3).join(" ");
							}
						}
					}

					fireUpdate();
				}
			} catch {
				// Non-JSON lines are expected
			}
		};

		proc.stdout.on("data", (d: Buffer) => {
			buf += d.toString();
			const lines = buf.split("\n");
			buf = lines.pop() || "";
			lines.forEach(processLine);
		});

		proc.stderr.on("data", (d: Buffer) => {
			stderrBuf += d.toString();
		});

			proc.on("close", (code) => {
				if (buf.trim()) processLine(buf);
				if (code !== 0 && stderrBuf.trim() && !progress.error) {
					progress.error = stderrBuf.trim();
				}
				finish(code ?? 1);
			});

			proc.on("error", (error) => {
				if (!progress.error) progress.error = `Failed to start subagent: ${error.message}`;
				finish(1);
			});

			timeoutTimer = setTimeout(() => {
				progress.timedOut = true;
				terminate(`Subagent timed out after ${formatDuration(timeoutMs)}`);
			}, timeoutMs);
			abortHandler = () => terminate("Subagent aborted by parent request");
			if (signal?.aborted) abortHandler();
			else if (signal) signal.addEventListener("abort", abortHandler, { once: true });
		});
	} finally {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {}
	}

	if (agent.name === "worker" && exitCode === 0 && workerReviewGate.state().pending && !progress.error) {
		progress.error = "Worker modified files without a successful reviewer after the latest edit.";
	}

	result.exitCode = exitCode;
	if (agent.name === "reviewer") {
		result.reviewVerdict = parseReviewerVerdict(result.output);
		if (exitCode === 0 && !progress.error && result.reviewVerdict !== "pass") {
			progress.error = `Reviewer verdict '${result.reviewVerdict}' does not satisfy the review gate.`;
		}
	}
	progress.status = exitCode === 0 && !progress.error ? "completed" : "failed";
	progress.durationMs = Date.now() - startTime;
	if (progress.error) result.output = result.output || `Error: ${progress.error}`;

	const outputLimits = agent.name === "reviewer"
		? { maxLines: REVIEWER_MAX_OUTPUT_LINES, maxBytes: REVIEWER_MAX_OUTPUT_BYTES }
		: { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES };
	const truncationMarker = "[Output truncated]";
	const markerBytes = Buffer.byteLength(`\n${truncationMarker}`, "utf-8");
	const trunc = truncateHead(result.output, {
		maxLines: Math.max(1, outputLimits.maxLines - 1),
		maxBytes: Math.max(1, outputLimits.maxBytes - markerBytes),
	});
	if (trunc.truncated) {
		const bounded = trunc.content.replace(/\n+$/, "");
		result.output = bounded ? `${bounded}\n${truncationMarker}` : truncationMarker;
	} else {
		result.output = trunc.content;
	}

	return result;
}

// ── Throttle ──────────────────────────────────────────────────────────

function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
	let lastCall = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	return ((...args: any[]) => {
		const now = Date.now();
		const remaining = ms - (now - lastCall);
		if (remaining <= 0) {
			lastCall = now;
			if (timer) { clearTimeout(timer); timer = undefined; }
			fn(...args);
		} else if (!timer) {
			timer = setTimeout(() => {
				lastCall = Date.now();
				timer = undefined;
				fn(...args);
			}, remaining);
		}
	}) as T;
}

// ── Parallel Execution with Concurrency Limit ─────────────────────────

async function mapConcurrent<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	async function runner() {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			results[i] = await fn(items[i], i);
		}
	}

	const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
	await Promise.all(runners);
	return results;
}

// ── Rendering ─────────────────────────────────────────────────────────

type Theme = ExtensionContext["ui"]["theme"];
type Component = ReturnType<typeof Text.prototype.render> extends string[] ? Text : any;

function getTermWidth(): number {
	return process.stdout.columns || 120;
}

function renderAgentProgress(
	r: AgentResult,
	theme: Theme,
	expanded: boolean,
	w: number,
): Container {
	const c = new Container();
	const prog = r.progress;
	const isRunning = prog.status === "running";
	const isPending = prog.status === "pending";

	// Header: icon + agent + stats (always one line, truncated)
	const icon = isRunning
		? theme.fg("warning", "⟳")
		: isPending
			? theme.fg("dim", "○")
			: prog.status === "completed"
				? theme.fg("success", "✓")
				: theme.fg("error", "✗");
	const stats = `${prog.toolCount} tools · ${formatTokens(prog.tokens)} tok · ${formatDuration(prog.durationMs)}`;
	const modelStr = r.model ? theme.fg("dim", ` (${r.model})`) : "";
	c.addChild(
		new Text(
			truncLine(`${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${modelStr} — ${theme.fg("dim", stats)}`, w),
			0, 0,
		),
	);

	// Task
	if (expanded) {
		// Full task, Text wraps naturally
		c.addChild(new Text(theme.fg("dim", `Task: ${r.task}`), 0, 0));
	} else {
		// Truncate to one line
		const flat = r.task.replace(/\n/g, " ");
		c.addChild(
			new Text(truncLine(theme.fg("dim", `Task: ${flat}`), w), 0, 0),
		);
	}

	// Current tool (running state)
	if (isRunning && prog.currentTool) {
		const toolLine = prog.currentToolArgs
			? `${prog.currentTool}: ${prog.currentToolArgs}`
			: prog.currentTool;
		if (expanded) {
			c.addChild(new Text(theme.fg("warning", `▸ ${toolLine}`), 0, 0));
		} else {
			c.addChild(new Text(truncLine(theme.fg("warning", `▸ ${toolLine}`), w), 0, 0));
		}
	}

	// Recent tools (always all)
	const toolsToShow = prog.recentTools;
	for (const t of toolsToShow) {
		const line = `  ${t.tool}: ${t.args}`;
		if (expanded) {
			c.addChild(new Text(theme.fg("muted", line), 0, 0));
		} else {
			c.addChild(new Text(truncLine(theme.fg("muted", line), w), 0, 0));
		}
	}

	// Latest assistant message — the prose "thinking" text, always visible
	if (prog.lastMessage) {
		c.addChild(new Spacer(1));
		if (expanded) {
			c.addChild(new Text(theme.fg("text", prog.lastMessage), 0, 0));
		} else {
			c.addChild(new Text(truncLine(theme.fg("text", prog.lastMessage), w), 0, 0));
		}
	}

	// Expanded: full final output
	if (!isRunning && r.output && expanded) {
		c.addChild(new Spacer(1));
		const mdTheme = getMarkdownTheme();
		c.addChild(new Markdown(r.output, 0, 0, mdTheme));
	}

	// Usage breakdown
	c.addChild(new Spacer(1));
	const usageParts: string[] = [];
	if (r.usage.turns) usageParts.push(`${r.usage.turns} turn${r.usage.turns > 1 ? "s" : ""}`);
	if (r.usage.input) usageParts.push(`in:${formatTokens(r.usage.input)}`);
	if (r.usage.output) usageParts.push(`out:${formatTokens(r.usage.output)}`);
	if (r.usage.cacheRead) usageParts.push(`cR:${formatTokens(r.usage.cacheRead)}`);
	if (r.usage.cacheWrite) usageParts.push(`cW:${formatTokens(r.usage.cacheWrite)}`);
	if (r.usage.cost) usageParts.push(`$${r.usage.cost.toFixed(4)}`);
	if (usageParts.length) {
		c.addChild(new Text(theme.fg("dim", usageParts.join(" · ")), 0, 0));
	}
	

	// Error
	if (prog.error) {
		if (expanded) {
			c.addChild(new Text(theme.fg("error", `Error: ${prog.error}`), 0, 0));
		} else {
			c.addChild(new Text(truncLine(theme.fg("error", `Error: ${prog.error}`), w), 0, 0));
		}
	}

	return c;
}

// ── Extension ─────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const config = loadConfig();
	const maxConcurrency = config.maxConcurrency;
	const parentReviewGate = createRepositoryReviewGate();
	const executionGate = createExecutionGate();
	let remindedPendingSignature: string | undefined;
	let agents = loadAgents();
	const childAllowlist = process.env.PI_SUBAGENT_ALLOWED
		?.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (childAllowlist?.length) {
		agents = agents.filter((agent) => childAllowlist.includes(agent.name));
	}

	const pendingScopes = () => parentReviewGate.state().scopes.filter((entry) => entry.pending);
	const pendingSignature = () => pendingScopes()
		.map((entry) => `${entry.scope}:${entry.mutationGeneration}`)
		.join("|");
	const pendingSummary = () => pendingScopes()
		.map((entry) => `${entry.scope}#${entry.mutationGeneration}`)
		.join(", ");

	pi.on("session_start", () => {
		parentReviewGate.reset();
		remindedPendingSignature = undefined;
	});

	pi.on("tool_result", (event, ctx) => {
		if ((event.toolName !== "edit" && event.toolName !== "write") || event.isError) return;
		const input = event.input as { path?: unknown } | undefined;
		const targetPath = typeof input?.path === "string" ? input.path : undefined;
		const scope = resolveRepositoryScope(ctx.cwd, targetPath);
		const generation = parentReviewGate.markMutation(scope);
		remindedPendingSignature = undefined;
		return {
			content: [
				...event.content,
				{
					type: "text" as const,
					text: `Repository mutation ${scope}#${generation} requires a fresh final reviewer for that repository before validation can be declared complete.`,
				},
			],
		};
	});

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant" || !parentReviewGate.state().pending) return;
		if (event.message.content.some((part) => part.type === "toolCall")) return;
		return {
			message: {
				...event.message,
				content: [{
					type: "text" as const,
					text: `Validation is blocked: these repositories still require a fresh final reviewer after their latest edit: ${pendingSummary()}.`,
				}],
			},
		};
	});

	pi.on("agent_settled", () => {
		if (!parentReviewGate.state().pending) return;
		const signature = pendingSignature();
		if (remindedPendingSignature === signature) return;
		remindedPendingSignature = signature;
		pi.sendMessage({
			customType: "review-gate",
			content: `Repository review is pending for ${pendingSummary()}. Invoke one final reviewer per repository. Give each reviewer the exact repository cwd, intended behavior, changed paths, existing-change boundaries, and smallest sufficient validation matrix.`,
			display: true,
		}, { deliverAs: "followUp", triggerTurn: true });
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description:
			"Run scout, researcher, or environment-scout for bounded read-only evidence, reviewer for execution-capable post-mutation validation, or worker for an explicitly approved isolated file edit. Include all context because children receive no parent-session context.",
		promptSnippet: "Run bounded evidence, execution-capable reviewer, or approval-gated worker tasks",
		promptGuidelines: [
			"Use direct read/fetch tool calls for simple known-path I/O instead of subagent.",
			"Use subagent by default when read-only evidence acquisition requires multiple searches or reads, covers several large sources, or would fill the parent context with replaceable raw output. Also use it for explicit delegation requests or workflow-required independent validation.",
			"Keep planning, decisions, approval context, evidence reconciliation, and final delivery judgment in the parent.",
			"Scout, researcher, and environment-scout are read-only. Reviewer can execute bounded review commands but cannot edit files. Environment-scout may use only structured kubectl/gcloud inspection for explicitly named targets. Use worker only after explicit user approval and exact file ownership; never delegate mutation of remotes, infrastructure, cloud, secrets, or Git.",
			"After any parent or worker repository edit, invoke one fresh final reviewer per changed repository after its final edit. A semantic pass clears only that repository; partial, blocked, failed, timed-out, stale, or missing-verdict reviews do not clear the gate.",
			"Before invoking reviewer, build a changed-path validation matrix and keep one reviewer to at most three independent heavy validation units. Prefer changed/new files and the smallest behavior proof over branch-wide reruns.",
			"Worker and reviewer are single-mode only. Use at most four parallel read-only tasks and include all paths, constraints, and required output because subagents receive no parent-session context.",
		],
		parameters: Type.Object({
			agent: Type.Optional(
				Type.String({ description: "Agent to invoke: scout, researcher, environment-scout, reviewer, or worker (SINGLE mode)", minLength: 1 }),
			),
			task: Type.Optional(Type.String({ description: "Bounded evidence, review, or edit task (SINGLE mode)", minLength: 1 })),
			tasks: Type.Optional(
				Type.Array(
					Type.Object({
						agent: Type.String({ description: "Read-only agent name: scout, researcher, or environment-scout", minLength: 1 }),
						task: Type.String({ description: "Independent bounded evidence task", minLength: 1 }),
						cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
					}),
					{
						description: `PARALLEL mode: at most ${MAX_SUBAGENT_TASKS} independent tasks`,
						maxItems: MAX_SUBAGENT_TASKS,
					},
				),
			),
			reviewMode: Type.Optional(
				StringEnum(["partial", "final"] as const, {
					description: "Reviewer gate behavior in single mode. partial records evidence only; final semantic pass clears the matching repository gate.",
				}),
			),
			cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode); reviewer should use the exact repository root" })),
		}),

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const cwd = ctx.cwd;
			const hasParallel = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);

			if (Number(hasParallel) + Number(hasSingle) !== 1) {
				throw new Error("Provide exactly one mode: (agent + task) for single mode, or tasks[] for parallel mode.");
			}
			if (params.reviewMode && (!hasSingle || params.agent !== "reviewer")) {
				throw new Error("reviewMode is valid only for a single reviewer task.");
			}

			const exclusiveRole = hasSingle && (params.agent === "reviewer" || params.agent === "worker")
				? params.agent
				: undefined;
			const releaseExecution = executionGate.enter(exclusiveRole);
			if (!releaseExecution) {
				throw new Error("Reviewer or worker single-mode execution cannot overlap another subagent call.");
			}

			try {
			if (hasParallel) {
				// ── Parallel mode ──
				const taskList = params.tasks!;
				if (taskList.length > MAX_SUBAGENT_TASKS) {
					throw new Error(`Too many subagent tasks: ${taskList.length}. Maximum is ${MAX_SUBAGENT_TASKS}.`);
				}

				// Validate all agents
				const available = agents.map((a) => a.name).join(", ") || "none";
				for (const t of taskList) {
					if (!agents.find((a) => a.name === t.agent)) {
						throw new Error(`Unknown agent: ${t.agent}. Available agents: ${available}`);
					}
					if (t.agent === "worker" || t.agent === "reviewer") {
						const label = t.agent === "worker" ? "Worker" : "Reviewer";
						throw new Error(`${label} is single-mode only to prevent concurrent repository commands or edits.`);
					}
				}

				const allResults: AgentResult[] = [];

				// Initialize all result slots as pending
				for (let i = 0; i < taskList.length; i++) {
					allResults[i] = {
						agent: taskList[i].agent,
						task: taskList[i].task,
						output: "",
						exitCode: -1,
						model: undefined,
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
						progress: { agent: taskList[i].agent, status: "pending" as any, task: taskList[i].task, recentTools: [], toolCount: 0, tokens: 0, durationMs: 0, lastMessage: "" },
					};
				}

				const flushParallelUpdate = () => {
					onUpdate?.({
						content: [{ type: "text", text: `Running ${taskList.length} tasks...` }],
						details: {
							mode: "parallel" as const,
							results: [...allResults],
						},
					});
				};
				const fireParallelUpdate = throttle(flushParallelUpdate, 150);

				const results = await mapConcurrent(taskList, maxConcurrency, async (t, idx) => {
					const agent = agents.find((a) => a.name === t.agent)!;
					const result = await runSubagent(agent, t.task, t.cwd ?? cwd, signal, (progress) => {
						allResults[idx].progress = progress;
						fireParallelUpdate();
					});

					// Update allResults with the completed result so the UI reflects it immediately
					allResults[idx] = result;
					flushParallelUpdate();

					return result;
				});

				// Build final output text
				const outputParts = results.map((r) => {
					const header = `## ${r.agent}${r.exitCode !== 0 ? " (FAILED)" : ""}`;
					return `${header}\n\n${r.output || "(no output)"}`;
				});

				return {
					content: [{ type: "text", text: outputParts.join("\n\n---\n\n") }],
					details: { mode: "parallel" as const, results },
				};
			} else if (hasSingle) {
				// ── Single mode ──
				const agentName = params.agent!;
				const task = params.task!;
				const agent = agents.find((candidate) => candidate.name === agentName);
				if (!agent) {
					const available = agents.map((candidate) => candidate.name).join(", ") || "none";
					throw new Error(`Unknown agent: ${agentName}. Available agents: ${available}`);
				}

				const executionCwd = params.cwd ?? cwd;
				const reviewMode: ReviewMode | undefined = agentName === "reviewer"
					? (params.reviewMode ?? "final")
					: undefined;
				const reviewScope = agentName === "reviewer"
					? resolveRepositoryScope(executionCwd)
					: undefined;
				const reviewGeneration = reviewScope
					? parentReviewGate.snapshot(reviewScope)
					: undefined;
				const effectiveTask = agentName === "reviewer"
					? [
						"REVIEW EXECUTION CONTRACT",
						`Mode: ${reviewMode}`,
						`Repository scope: ${reviewScope}`,
						`Hard process deadline: ${formatDuration(DEFAULT_SUBAGENT_TIMEOUT_MS)}. Finish commands within four minutes and reserve the final minute for findings.`,
						"A partial pass records evidence but does not clear the repository review gate. A final semantic pass can clear only this repository scope.",
						"",
						task,
					].join("\n")
					: task;
				const liveResult: AgentResult = {
					agent: agentName,
					task: effectiveTask,
					output: "",
					exitCode: -1,
					model: agent.model,
					reviewMode,
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
					progress: { agent: agentName, status: "running" as const, task: effectiveTask, recentTools: [], toolCount: 0, tokens: 0, durationMs: 0, lastMessage: "" },
				};
				const result = await runSubagent(agent, effectiveTask, executionCwd, signal, (progress) => {
					liveResult.progress = progress;
					onUpdate?.({
						content: [{ type: "text", text: "(running...)" }],
						details: { mode: "single" as const, results: [liveResult] },
					});
				});
				result.reviewMode = reviewMode;

				if (reviewScope && reviewGeneration !== undefined && reviewMode === "final") {
					const childSucceeded = reviewerResultPassed(result);
					const accepted = parentReviewGate.completeReview(reviewScope, reviewGeneration, childSucceeded);
					if (childSucceeded && !accepted) {
						result.progress.error = `Reviewer completed before the latest edit in ${reviewScope}; run a fresh final reviewer.`;
						result.progress.status = "failed";
					}
				}

				const isError = result.exitCode !== 0 || !!result.progress.error;
				return {
					content: [{ type: "text", text: result.output || "(no output)" }],
					details: { mode: "single" as const, results: [result] },
					...(isError ? { isError: true } : {}),
				};
			}

			throw new Error("Invalid subagent mode");
			} finally {
				releaseExecution();
			}
		},

		// ── Render: tool call header ──
		renderCall(args, theme, _context) {
			if (args.tasks && args.tasks.length > 0) {
				const agentNames = args.tasks.map((t: any) => t.agent).join(", ");
				return new Text(
					`${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("accent", "parallel")} ${theme.fg("dim", `(${args.tasks.length} tasks: ${agentNames})`)}`,
					0, 0,
				);
			}
			if (args.agent) {
				const taskPreview = args.task
					? (args.task.length > 60 ? args.task.slice(0, 60) + "…" : args.task).replace(/\n/g, " ")
					: "";
				return new Text(
					`${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("accent", args.agent)} ${theme.fg("dim", taskPreview)}`,
					0, 0,
				);
			}
			return new Text(theme.fg("toolTitle", theme.bold("subagent")), 0, 0);
		},

		// ── Render: result ──
		renderResult(result, options, theme, context) {
			const details = result.details as Details | undefined;
			if (!details?.results?.length) {
				const t = result.content[0];
				const text = t?.type === "text" ? t.text : "(no output)";
				return new Text(text.slice(0, 200), 0, 0);
			}

			const w = getTermWidth() - 4;
			const expanded = options.expanded;
			const c = new Container();

			if (details.mode === "parallel") {
				// Parallel summary header
				const ok = details.results.filter((r) => r.exitCode === 0).length;
				const running = details.results.filter((r) => r.progress?.status === "running").length;
				const totalIcon = running > 0
					? theme.fg("warning", "⟳")
					: ok === details.results.length
						? theme.fg("success", "✓")
						: theme.fg("error", "✗");

				const totalDuration = Math.max(...details.results.map((r) => r.progress?.durationMs || 0));
				const totalTokens = details.results.reduce((s, r) => s + (r.progress?.tokens || 0), 0);
				c.addChild(
					new Text(
						truncLine(
							`${totalIcon} ${theme.fg("toolTitle", theme.bold("parallel"))} ${ok}/${details.results.length} completed · ${formatTokens(totalTokens)} tok · ${formatDuration(totalDuration)}`,
							w,
						),
						0, 0,
					),
				);
				c.addChild(new Spacer(1));

				for (let i = 0; i < details.results.length; i++) {
					const r = details.results[i];
					c.addChild(renderAgentProgress(r, theme, expanded, w));
					if (i < details.results.length - 1) c.addChild(new Spacer(1));
				}
			} else {
				// Single agent
				const r = details.results[0];
				c.addChild(renderAgentProgress(r, theme, expanded, w));
			}

			return c;
		},
	});
}
