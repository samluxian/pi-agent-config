/**
 * Minimal subagents extension.
 *
 * Registers a single `subagent` tool with bounded evidence agents, an
 * read-only evidence agents and one approval-gated editing worker.
 * Supports single and bounded parallel evidence execution with verbal output only.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme, parseFrontmatter, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { boundTextEvidence, SUBAGENT_RESULT_BUDGET, SUBAGENT_TOOL_OUTPUT_BUDGET } from "../context-pipeline/text-budget.ts";
import { boundedRedactedText, redactSensitiveText } from "../context-pipeline/redaction.ts";

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
	lastToolError?: string;
	error?: string;
}

interface AgentResult {
	agent: string;
	task: string;
	output: string;
	outputComplete: boolean;
	outputStats: { sourceLines: number; sourceBytes: number; emittedLines: number; emittedBytes: number };
	exitCode: number;
	progress: AgentProgress;
	model?: string;
	usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number };
}

interface Details {
	mode: "single" | "parallel";
	results: AgentResult[];
	contentComplete?: boolean;
}

function applyResultBudget(result: AgentResult, maxLines: number, maxBytes: number, label: string): void {
	const bounded = boundTextEvidence(result.output, { maxLines, maxBytes, label });
	result.output = bounded.text;
	result.outputComplete &&= bounded.contentComplete;
	result.outputStats.emittedLines = bounded.emittedLines;
	result.outputStats.emittedBytes = bounded.emittedBytes;
}

export function allocateFairBudgetCaps(demands: number[], total: number, minimum: number): number[] {
	if (!demands.length) return [];
	const base = Math.min(minimum, Math.floor(total / demands.length));
	const caps = demands.map((demand) => Math.min(Math.max(0, demand), base));
	let remaining = Math.max(0, total - caps.reduce((sum, cap) => sum + cap, 0));
	while (remaining > 0) {
		const needy = demands.map((demand, index) => ({ demand, index }))
			.filter(({ demand, index }) => demand > caps[index]);
		if (!needy.length) break;
		const share = Math.max(1, Math.floor(remaining / needy.length));
		for (const { demand, index } of needy) {
			const granted = Math.min(demand - caps[index], share, remaining);
			caps[index] += granted;
			remaining -= granted;
			if (!remaining) break;
		}
	}
	return caps;
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
const DEFAULT_TERMINATE_GRACE_MS = 3000;
const ALLOWED_AGENT_NAMES = new Set(["scout", "researcher", "environment-scout", "worker"]);
const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export function createExecutionGate() {
	let active = 0;
	let exclusiveRole: "worker" | undefined;

	return {
		enter(role?: "worker"): (() => void) | undefined {
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
const CONTEXT_PIPELINE_EXTENSION = path.join(EXT_DIR, "..", "context-pipeline", "index.ts");
const CUSTOM_TOOL_EXTENSIONS: Record<string, string> = {
	web_search: WEB_ACCESS_EXTENSION,
	fetch_content: WEB_ACCESS_EXTENSION,
	kubectl_inspect: path.join(TOOLS_DIR, "environment-inspect.ts"),
	gcloud_inspect: path.join(TOOLS_DIR, "environment-inspect.ts"),
	safe_bash: path.join(TOOLS_DIR, "safe-bash.ts"),
	subagent: path.join(EXT_DIR, "index.ts"),
};

// ── Agent Discovery & Registration ────────────────────────────────────

function parseAgentList(value: string | undefined): string[] | undefined {
	const agents = value?.split(",").map((agent) => agent.trim()).filter(Boolean);
	return agents?.length ? agents : undefined;
}

function parseAgentProfile(filePath: string): AgentConfig {
	const content = fs.readFileSync(filePath, "utf-8");
	const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
	const name = frontmatter.name;
	const thinking = frontmatter.thinking as ThinkingLevel | undefined;
	if (!name || !frontmatter.description || !frontmatter.model || !thinking || !THINKING_LEVELS.has(thinking)) {
		throw new Error(`Invalid subagent profile: ${filePath}. name, description, model, and thinking are required.`);
	}
	if (!ALLOWED_AGENT_NAMES.has(name)) {
		throw new Error(`Unsupported subagent profile: ${name}. Allowed agents: scout, researcher, environment-scout, worker.`);
	}
	const subagentAgents = parseAgentList(frontmatter.subagent_agents);
	return {
		name,
		description: frontmatter.description,
		tools: parseAgentList(frontmatter.tools) ?? [],
		model: frontmatter.model,
		thinking,
		systemPrompt: body,
		filePath,
		...(subagentAgents ? { subagentAgents } : {}),
	};
}

export function loadAgents(agentDir = AGENTS_DIR): AgentConfig[] {
	if (!fs.existsSync(agentDir)) return [];
	const loaded: AgentConfig[] = [];
	for (const entry of fs.readdirSync(agentDir).filter((entry) => entry.endsWith(".md"))) {
		const profile = parseAgentProfile(path.join(agentDir, entry));
		if (loaded.some((agent) => agent.name === profile.name)) {
			throw new Error(`Duplicate subagent profile: ${profile.name}`);
		}
		loaded.push(profile);
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

function ansiSequenceAt(text: string, index: number): string | undefined {
	return text[index] === "\x1b" ? text.slice(index).match(/^\x1b\[[0-9;]*m/)?.[0] : undefined;
}

export function truncLine(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;
	let result = "";
	let width = 0;
	for (let i = 0; i < text.length; i++) {
		const ansi = ansiSequenceAt(text, i);
		if (ansi) {
			result += ansi;
			i += ansi.length - 1;
			continue;
		}
		if (width >= maxWidth - 1) return result + "…";
		result += text[i];
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
			if (tool === "safe_bash") extensionPaths.add(CONTEXT_PIPELINE_EXTENSION);
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
	let preview: string;
	if (args.command) preview = String(args.command);
	else if (args.path) preview = String(args.path);
	else if (args.query) preview = `"${String(args.query)}"`;
	else if (args.url) preview = String(args.url);
	else if (args.pattern) preview = String(args.pattern);
	else preview = JSON.stringify(args);
	return boundedRedactedText(preview, 100);
}

type ActiveToolCalls = Map<string, { toolName: string; argsPreview: string }>;
type SubagentEventContext = {
	result: AgentResult;
	progress: AgentProgress;
	activeToolCalls: ActiveToolCalls;
	fireUpdate: () => void;
	startTime: number;
};

function trimRecentTools(recentTools: ToolEvent[]): void {
	if (recentTools.length > 20) recentTools.splice(0, recentTools.length - 20);
}

function handleToolStart(evt: any, context: SubagentEventContext): void {
	const args = (evt.args || {}) as Record<string, unknown>;
	const toolCallId = String(evt.toolCallId ?? "");
	const argsPreview = extractToolArgsPreview(args);
	context.activeToolCalls.set(toolCallId, { toolName: evt.toolName, argsPreview });
	context.progress.toolCount++;
	context.progress.currentTool = evt.toolName;
	context.progress.currentToolArgs = argsPreview;
	context.fireUpdate();
}

function toolErrorDiagnostic(evt: any, call: { toolName: string } | undefined): string {
	const resultContent = evt.result && typeof evt.result === "object" ? evt.result.content : evt.result;
	return extractTextFromContent(resultContent)
		|| evt.result?.errorMessage
		|| evt.result?.message
		|| `${evt.toolName || call?.toolName || "tool"} failed`;
}

function handleToolEnd(evt: any, context: SubagentEventContext): void {
	const toolCallId = String(evt.toolCallId ?? "");
	const call = context.activeToolCalls.get(toolCallId);
	context.activeToolCalls.delete(toolCallId);
	if (call) {
		context.progress.recentTools.push({ toolCallId, tool: call.toolName, args: call.argsPreview });
		trimRecentTools(context.progress.recentTools);
	}
	const remainingCall = Array.from(context.activeToolCalls.values()).at(-1);
	context.progress.currentTool = remainingCall?.toolName;
	context.progress.currentToolArgs = remainingCall?.argsPreview;
	if (evt.isError) context.progress.lastToolError = boundedRedactedText(toolErrorDiagnostic(evt, call), 1000);
	context.fireUpdate();
}

function extractProse(text: string): string {
	let inCodeBlock = false;
	const proseLines: string[] = [];
	for (const line of text.split("\n")) {
		if (line.trimStart().startsWith("```")) {
			inCodeBlock = !inCodeBlock;
		} else if (!inCodeBlock && line.trim()) {
			proseLines.push(line.trim());
		}
	}
	return proseLines.slice(0, 3).join(" ");
}

function handleAssistantMessage(evt: any, context: SubagentEventContext): void {
	const message = evt.message;
	if (message.role !== "assistant") return;
	const { result, progress } = context;
	result.usage.turns++;
	const usage = message.usage;
	if (usage) {
		result.usage.input += usage.input || 0;
		result.usage.output += usage.output || 0;
		result.usage.cacheRead += usage.cacheRead || 0;
		result.usage.cacheWrite += usage.cacheWrite || 0;
		result.usage.cost += usage.cost?.total || 0;
		progress.tokens = result.usage.input + result.usage.output;
	}
	if (message.model) result.model = message.model;
	if (message.errorMessage) progress.error = redactSensitiveText(message.errorMessage);
	const text = redactSensitiveText(extractTextFromContent(message.content));
	if (text) {
		result.output = text;
		progress.lastMessage = extractProse(text) || progress.lastMessage;
	}
	context.fireUpdate();
}

function processSubagentLine(line: string, context: SubagentEventContext): void {
	if (!line.trim()) return;
	try {
		const evt = JSON.parse(line) as any;
		context.progress.durationMs = Date.now() - context.startTime;
		const handlers: Record<string, (event: any, eventContext: SubagentEventContext) => void> = {
			tool_execution_start: handleToolStart,
			tool_execution_end: handleToolEnd,
			message_end: handleAssistantMessage,
		};
		handlers[evt.type]?.(evt, context);
	} catch {
		// Non-JSON lines are expected
	}
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

	const displayTask = redactSensitiveText(task);
	const result: AgentResult = {
		agent: agent.name,
		task: displayTask,
		output: "",
		outputComplete: true,
		outputStats: { sourceLines: 0, sourceBytes: 0, emittedLines: 0, emittedBytes: 0 },
		exitCode: 0,
		model: agent.model,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		progress: {
			agent: agent.name,
			status: "running",
			task: displayTask,
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
	const activeToolCalls = new Map<string, {
		toolName: string;
		argsPreview: string;
	}>();
	let exitCode = 1;

	try {
		exitCode = await new Promise<number>(function watchSubagentProcess(resolve) {
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
				if (!progress.error) progress.error = redactSensitiveText(reason);
				try {
					proc.kill("SIGTERM");
				} catch {}
				terminateTimer = setTimeout(function forceKillAfterGrace() {
					if (closed) return;
					try {
						proc.kill("SIGKILL");
					} catch {}
				}, terminateGraceMs);
			};

		const eventContext: SubagentEventContext = { result, progress, activeToolCalls, fireUpdate, startTime };
		const processLine = (line: string) => processSubagentLine(line, eventContext);

		proc.stdout.on("data", (d: Buffer) => {
			buf += d.toString();
			const lines = buf.split("\n");
			buf = lines.pop() || "";
			lines.forEach(processLine);
		});

		proc.stderr.on("data", (d: Buffer) => {
			stderrBuf += d.toString();
		});

			proc.on("close", function handleProcessClose(code) {
				if (buf.trim()) processLine(buf);
				if (code !== 0 && stderrBuf.trim() && !progress.error) {
					progress.error = redactSensitiveText(stderrBuf.trim());
				}
				finish(code ?? 1);
			});

			proc.on("error", (error) => {
				if (!progress.error) progress.error = redactSensitiveText(`Failed to start subagent: ${error.message}`);
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

	result.exitCode = exitCode;
	progress.status = exitCode === 0 && !progress.error ? "completed" : "failed";
	progress.durationMs = Date.now() - startTime;
	if (progress.error) result.output = result.output || `Error: ${progress.error}`;

	result.output = redactSensitiveText(result.output);
	const bounded = boundTextEvidence(result.output, {
		maxLines: SUBAGENT_RESULT_BUDGET.maxLines,
		maxBytes: SUBAGENT_RESULT_BUDGET.maxBytes,
		label: "subagent response",
	});
	result.output = bounded.text;
	result.outputComplete = bounded.contentComplete;
	result.outputStats = {
		sourceLines: bounded.sourceLines,
		sourceBytes: bounded.sourceBytes,
		emittedLines: bounded.emittedLines,
		emittedBytes: bounded.emittedBytes,
	};

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

function addLine(container: Container, theme: Theme, color: string, text: string, expanded: boolean, width: number): void {
	const rendered = theme.fg(color, text);
	container.addChild(new Text(expanded ? rendered : truncLine(rendered, width), 0, 0));
}

function addRenderedLine(container: Container, text: string, width: number): void {
	container.addChild(new Text(truncLine(text, width), 0, 0));
}

function progressIcon(status: AgentProgress["status"], theme: Theme): string {
	const icons: Record<AgentProgress["status"], [string, string]> = {
		running: ["warning", "⟳"], pending: ["dim", "○"], completed: ["success", "✓"], failed: ["error", "✗"],
	};
	const [color, icon] = icons[status];
	return theme.fg(color, icon);
}

function usageSummary(usage: AgentResult["usage"]): string {
	const parts = [
		usage.turns && `${usage.turns} turn${usage.turns > 1 ? "s" : ""}`,
		usage.input && `in:${formatTokens(usage.input)}`,
		usage.output && `out:${formatTokens(usage.output)}`,
		usage.cacheRead && `cR:${formatTokens(usage.cacheRead)}`,
		usage.cacheWrite && `cW:${formatTokens(usage.cacheWrite)}`,
		usage.cost && `$${usage.cost.toFixed(4)}`,
	].filter(Boolean);
	return parts.join(" · ");
}

function renderAgentProgress(r: AgentResult, theme: Theme, expanded: boolean, width: number): Container {
	const container = new Container();
	const { progress } = r;
	const stats = `${progress.toolCount} tools · ${formatTokens(progress.tokens)} tok · ${formatDuration(progress.durationMs)}`;
	const model = r.model ? theme.fg("dim", ` (${r.model})`) : "";
	addRenderedLine(container, `${progressIcon(progress.status, theme)} ${theme.fg("toolTitle", theme.bold(r.agent))}${model} — ${theme.fg("dim", stats)}`, width);
	addLine(container, theme, "dim", `Task: ${expanded ? r.task : r.task.replace(/\n/g, " ")}`, expanded, width);
	if (progress.status === "running" && progress.currentTool) {
		addLine(container, theme, "warning", `▸ ${progress.currentToolArgs ? `${progress.currentTool}: ${progress.currentToolArgs}` : progress.currentTool}`, expanded, width);
	}
	for (const tool of progress.recentTools) addLine(container, theme, "muted", `  ${tool.tool}: ${tool.args}`, expanded, width);
	if (progress.lastMessage) {
		container.addChild(new Spacer(1));
		addLine(container, theme, "text", progress.lastMessage, expanded, width);
	}
	if (progress.status !== "running" && r.output && expanded) {
		container.addChild(new Spacer(1));
		container.addChild(new Markdown(r.output, 0, 0, getMarkdownTheme()));
	}
	container.addChild(new Spacer(1));
	const usage = usageSummary(r.usage);
	if (usage) addLine(container, theme, "dim", usage, true, width);
	if (progress.lastToolError) addLine(container, theme, "error", `Tool error: ${progress.lastToolError}`, expanded, width);
	if (progress.error) addLine(container, theme, "error", `Error: ${progress.error}`, expanded, width);
	return container;
}

// ── Extension ─────────────────────────────────────────────────────────

type SubagentTask = { agent: string; task: string; cwd?: string };
type SubagentParams = { agent?: string; task?: string; tasks?: SubagentTask[]; cwd?: string };
type ExecutionDependencies = { agents: AgentConfig[]; maxConcurrency: number; gate: ReturnType<typeof createExecutionGate> };

function availableAgentNames(agents: AgentConfig[]): string {
	return agents.map((agent) => agent.name).join(", ") || "none";
}

function requireAgent(agents: AgentConfig[], name: string): AgentConfig {
	const agent = agents.find((candidate) => candidate.name === name);
	if (!agent) throw new Error(`Unknown agent: ${name}. Available agents: ${availableAgentNames(agents)}`);
	return agent;
}

function createLiveResult(agent: AgentConfig, task: string, status: AgentProgress["status"]): AgentResult {
	const displayTask = redactSensitiveText(task);
	return {
		agent: agent.name, task: displayTask, output: "", outputComplete: true,
		outputStats: { sourceLines: 0, sourceBytes: 0, emittedLines: 0, emittedBytes: 0 }, exitCode: -1, model: status === "pending" ? undefined : agent.model,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		progress: { agent: agent.name, status, task: displayTask, recentTools: [], toolCount: 0, tokens: 0, durationMs: 0, lastMessage: "" },
	};
}

function validateParallelTasks(tasks: SubagentTask[], agents: AgentConfig[]): void {
	if (tasks.length > MAX_SUBAGENT_TASKS) throw new Error(`Too many subagent tasks: ${tasks.length}. Maximum is ${MAX_SUBAGENT_TASKS}.`);
	for (const task of tasks) {
		requireAgent(agents, task.agent);
		if (task.agent === "worker") throw new Error("Worker is single-mode only to prevent concurrent repository commands or edits.");
	}
}

async function executeParallel(tasks: SubagentTask[], cwd: string, signal: AbortSignal | undefined, onUpdate: any, dependencies: ExecutionDependencies): Promise<any> {
	validateParallelTasks(tasks, dependencies.agents);
	const allResults = tasks.map((task) => createLiveResult(requireAgent(dependencies.agents, task.agent), task.task, "pending"));
	const flushUpdate = () => onUpdate?.({ content: [{ type: "text", text: `Running ${tasks.length} tasks...` }], details: { mode: "parallel" as const, results: [...allResults] } });
	const fireUpdate = throttle(flushUpdate, 150);
	const results = await mapConcurrent(tasks, dependencies.maxConcurrency, async (task, index) => {
		const result = await runSubagent(requireAgent(dependencies.agents, task.agent), task.task, task.cwd ?? cwd, signal, (progress) => {
			allResults[index].progress = progress;
			fireUpdate();
		});
		allResults[index] = result;
		flushUpdate();
		return result;
	});
	const byteCaps = allocateFairBudgetCaps(results.map((result) => Buffer.byteLength(result.output, "utf8")), SUBAGENT_TOOL_OUTPUT_BUDGET.maxBytes - 2048, 2 * 1024);
	const lineCaps = allocateFairBudgetCaps(results.map((result) => result.output.split("\n").length), SUBAGENT_TOOL_OUTPUT_BUDGET.maxLines - 32, 40);
	for (const [index, result] of results.entries()) applyResultBudget(result, lineCaps[index], byteCaps[index], `${result.agent} result`);
	const outputParts = results.map((result) => `## ${result.agent}${result.exitCode !== 0 ? " (FAILED)" : ""}\n\n${result.output || "(no output)"}`);
	const bounded = boundTextEvidence(outputParts.join("\n\n---\n\n"), { maxLines: SUBAGENT_TOOL_OUTPUT_BUDGET.maxLines, maxBytes: SUBAGENT_TOOL_OUTPUT_BUDGET.maxBytes, label: "parallel subagent output" });
	return { content: [{ type: "text", text: bounded.text }], details: { mode: "parallel" as const, results, contentComplete: bounded.contentComplete && results.every((result) => result.outputComplete) } };
}

async function executeSingle(agentName: string, task: string, cwd: string, signal: AbortSignal | undefined, onUpdate: any, agents: AgentConfig[]): Promise<any> {
	const agent = requireAgent(agents, agentName);
	const liveResult = createLiveResult(agent, task, "running");
	const result = await runSubagent(agent, task, cwd, signal, (progress) => {
		liveResult.progress = progress;
		onUpdate?.({ content: [{ type: "text", text: "(running...)" }], details: { mode: "single" as const, results: [liveResult] } });
	});
	const isError = result.exitCode !== 0 || !!result.progress.error;
	return { content: [{ type: "text", text: result.output || "(no output)" }], details: { mode: "single" as const, results: [result], contentComplete: result.outputComplete }, ...(isError ? { isError: true } : {}) };
}

async function executeSubagent(params: SubagentParams, signal: AbortSignal | undefined, onUpdate: any, cwd: string, dependencies: ExecutionDependencies): Promise<any> {
	const hasParallel = (params.tasks?.length ?? 0) > 0;
	const hasSingle = Boolean(params.agent && params.task);
	if (Number(hasParallel) + Number(hasSingle) !== 1) throw new Error("Provide exactly one mode: (agent + task) for single mode, or tasks[] for parallel mode.");
	const release = dependencies.gate.enter(hasSingle && params.agent === "worker" ? "worker" : undefined);
	if (!release) throw new Error("Worker single-mode execution cannot overlap another subagent call.");
	try {
		return await (hasParallel
			? executeParallel(params.tasks!, cwd, signal, onUpdate, dependencies)
			: executeSingle(params.agent!, params.task!, params.cwd ?? cwd, signal, onUpdate, dependencies.agents));
	} finally {
		release();
	}
}

export default function (pi: ExtensionAPI) {
	const config = loadConfig();
	const maxConcurrency = config.maxConcurrency;
	const executionGate = createExecutionGate();
	let agents = loadAgents();
	const childAllowlist = process.env.PI_SUBAGENT_ALLOWED
		?.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (childAllowlist?.length) {
		agents = agents.filter((agent) => childAllowlist.includes(agent.name));
	}

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description:
			"Run scout, researcher, or environment-scout for bounded read-only evidence, or worker for an explicitly approved isolated file edit. Include all context because children receive no parent-session context.",
		promptSnippet: "Run bounded evidence or an approval-gated worker task",
		promptGuidelines: [
			"Use direct read/fetch tool calls for simple known-path I/O instead of subagent.",
			"Use subagent by default when read-only evidence acquisition requires multiple searches or reads, covers several large sources, or would fill the parent context with replaceable raw output. Also use it for explicit delegation requests.",
			"Keep planning, decisions, approval context, evidence reconciliation, validation responsibility, and final delivery judgment in the parent.",
			"Scout, researcher, and environment-scout are read-only. Environment-scout may use structured kubectl/gcloud context discovery, then inspect only explicit or safely discovered targets. Use worker only after explicit user approval and exact file ownership; never delegate mutation of remotes, infrastructure, cloud, secrets, or Git.",
			"Worker is single-mode only. Use at most four parallel read-only tasks and include all paths, constraints, and required output because subagents receive no parent-session context.",
		],
		parameters: Type.Object({
			agent: Type.Optional(
				Type.String({ description: "Agent to invoke: scout, researcher, environment-scout, or worker (SINGLE mode)", minLength: 1 }),
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
			cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			return executeSubagent(params, signal, onUpdate, ctx.cwd, { agents, maxConcurrency, gate: executionGate });
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
				const safeTask = args.task ? redactSensitiveText(args.task) : "";
				const taskPreview = safeTask
					? (safeTask.length > 60 ? safeTask.slice(0, 60) + "…" : safeTask).replace(/\n/g, " ")
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
