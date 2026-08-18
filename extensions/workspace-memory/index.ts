import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	atomicWriteJson,
	boundText,
	catalogPath,
	defaultGitProbe,
	findCatalogForCwd,
	loadCatalog,
	MAX_CONTEXT_BYTES,
	MAX_CONTEXT_LINES,
	MAX_TOOL_BYTES,
	MAX_TOOL_LINES,
	memoryRoot,
	registerWorkspace,
	repoForPath,
	scanWorkspace,
	validateNote,
	withInterprocessLock,
	workspaceHash,
	type CatalogDependencies,
	type GitProbe,
	type GitSnapshot,
	type RepositoryMemory,
	type WorkspaceCatalog,
} from "./catalog.ts";

export const WORKSPACE_MEMORY_MARKER = "WORKSPACE_MEMORY_V1";
export const SELECTION_ENTRY_TYPE = "workspace-memory-selection";
const MAX_LIST_REPOSITORIES = 24;

export interface WorkspaceMemoryOptions extends CatalogDependencies {
	agentDir?: string;
}

interface RuntimeState {
	catalog?: WorkspaceCatalog;
	catalogFile?: string;
	selectedRepo?: string;
	lastLiveIdentity?: string;
}

function parseArguments(input: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote = "";
	let escaped = false;
	for (const char of input.trim()) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = "";
			else current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) {
				args.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (escaped) current += "\\";
	if (quote) throw new Error("Unclosed quote in /workspace arguments");
	if (current) args.push(current);
	return args;
}

function oneLine(value: string | undefined, maxChars = 120): string | undefined {
	if (!value) return undefined;
	const line = value.replace(/\s+/g, " ").trim();
	return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line;
}

function shortHead(head: string): string {
	return head ? head.slice(0, 12) : "unknown";
}

function repositorySummary(repo: RepositoryMemory): string {
	const types = repo.detectedTypes.length ? repo.detectedTypes.join(",") : "unclassified";
	const note = oneLine(repo.note);
	return `- ${repo.id} [${repo.status}; ${types}]${note ? ` — ${note}` : ""}`;
}

export function buildWorkspaceContext(
	catalog: WorkspaceCatalog,
	selectedRepo?: string,
	live?: GitSnapshot,
): string {
	const active = Object.values(catalog.repositories).filter((repo) => repo.status === "active").sort((a, b) => a.id.localeCompare(b.id));
	const lines = [
		WORKSPACE_MEMORY_MARKER,
		"Machine-local workspace orientation only. Revalidate repository files, branch, status, and remote freshness before decisions or edits.",
		`Workspace root: ${catalog.workspaceRoot}`,
		`Indexed repositories: ${active.length}`,
	];
	for (const repo of active.slice(0, MAX_LIST_REPOSITORIES)) lines.push(repositorySummary(repo));
	if (active.length > MAX_LIST_REPOSITORIES) lines.push(`- … ${active.length - MAX_LIST_REPOSITORIES} more; query workspace_catalog`);
	if (selectedRepo) {
		const repo = catalog.repositories[selectedRepo];
		if (repo?.status === "active") {
			lines.push(`Selected repository: ${repo.id} (${repo.realPath})`);
			const snapshot = live ?? repo.git;
			lines.push(`Local Git: ${snapshot.branch}@${shortHead(snapshot.head)}; dirty=${snapshot.dirty}; remote freshness unknown`);
			const branchMemory = snapshot.branch !== "DETACHED" ? repo.branchMemories[snapshot.branch] : undefined;
			if (branchMemory) {
				if (branchMemory.head === snapshot.head) lines.push(`Confirmed branch memory: ${oneLine(branchMemory.note, 240)}`);
				else lines.push(`Branch memory is stale: recorded ${shortHead(branchMemory.head)}, current ${shortHead(snapshot.head)}; do not rely on it`);
			}
		}
	}
	return boundText(lines.join("\n"), MAX_CONTEXT_LINES, MAX_CONTEXT_BYTES);
}

function formatRepository(repo: RepositoryMemory, live?: GitSnapshot): string {
	const snapshot = live ?? repo.git;
	const lines = [
		`Repository: ${repo.id}`,
		`Path: ${repo.realPath}`,
		`Status: ${repo.status}`,
		`Detected types: ${repo.detectedTypes.join(", ") || "unclassified"}`,
		`Local Git: ${snapshot.branch}@${shortHead(snapshot.head)}; dirty=${snapshot.dirty}; remote freshness unknown`,
		`Repository note: ${repo.note ?? "none"}`,
	];
	const branches = Object.entries(repo.branchMemories).sort(([a], [b]) => a.localeCompare(b));
	if (branches.length) {
		lines.push("Branch memories:");
		for (const [branch, memory] of branches) {
			const state = branch === snapshot.branch && memory.head === snapshot.head ? "current" : "stored";
			lines.push(`- ${branch}@${shortHead(memory.head)} [${state}] ${oneLine(memory.note, 220)}`);
		}
	}
	return boundText(lines.join("\n"), MAX_TOOL_LINES, MAX_TOOL_BYTES);
}

function formatCatalog(catalog: WorkspaceCatalog): string {
	const repos = Object.values(catalog.repositories).sort((a, b) => a.id.localeCompare(b.id));
	return boundText([
		`Workspace: ${catalog.workspaceRoot}`,
		`Updated: ${catalog.updatedAt}`,
		...repos.map(repositorySummary),
	].join("\n"), MAX_TOOL_LINES, MAX_TOOL_BYTES);
}

function commandHelp(): string {
	return [
		"/workspace init [root]",
		"/workspace refresh",
		"/workspace list",
		"/workspace show <repo>",
		"/workspace use <repo>",
		"/workspace remember <repo> [--branch] <note>",
		"/workspace analyze <repo>",
		"/workspace forget <repo>",
	].join("\n");
}

export function registerWorkspaceMemory(pi: ExtensionAPI, options: WorkspaceMemoryOptions = {}): void {
	const agentDir = options.agentDir ?? getAgentDir();
	const now = options.now ?? (() => new Date().toISOString());
	const gitProbe: GitProbe = options.gitProbe ?? defaultGitProbe;
	const state: RuntimeState = {};

	const notify = (ctx: any, message: string, level: "info" | "warning" | "error" = "info") => {
		ctx?.ui?.notify?.(message, level);
	};

	const resetState = () => {
		state.catalog = undefined;
		state.catalogFile = undefined;
		state.selectedRepo = undefined;
		state.lastLiveIdentity = undefined;
	};

	const loadForCwd = async (cwd: string): Promise<void> => {
		const filePath = await findCatalogForCwd(agentDir, cwd);
		if (!filePath) {
			state.catalog = undefined;
			state.catalogFile = undefined;
			return;
		}
		state.catalog = await loadCatalog(filePath);
		state.catalogFile = filePath;
	};

	const storageLock = path.join(memoryRoot(agentDir), ".catalog.lock");

	const persistCatalogUnlocked = async (catalog: WorkspaceCatalog): Promise<void> => {
		const filePath = catalogPath(agentDir, catalog.workspaceHash);
		await withFileMutationQueue(filePath, () => atomicWriteJson(filePath, catalog));
		const registryFile = path.join(memoryRoot(agentDir), "registry.json");
		await withFileMutationQueue(registryFile, () => registerWorkspace(agentDir, catalog));
		state.catalog = catalog;
		state.catalogFile = filePath;
	};

	const mutateCatalog = async (
		mutator: (catalog: WorkspaceCatalog) => Promise<WorkspaceCatalog> | WorkspaceCatalog,
	): Promise<WorkspaceCatalog> => {
		if (!state.catalogFile) throw new Error("No workspace catalog file is active");
		return withInterprocessLock(storageLock, async () => {
			const current = await loadCatalog(state.catalogFile!);
			const next = await mutator(current);
			await persistCatalogUnlocked(next);
			return next;
		});
	};

	const requireCatalog = async (cwd: string): Promise<WorkspaceCatalog> => {
		if (!state.catalog) await loadForCwd(cwd);
		if (!state.catalog) throw new Error("No workspace catalog. Run /workspace init from the workspace root.");
		return state.catalog;
	};

	const effectiveRepo = (catalog: WorkspaceCatalog, cwd: string): RepositoryMemory | undefined => {
		if (state.selectedRepo) return catalog.repositories[state.selectedRepo];
		return repoForPath(catalog, cwd);
	};

	pi.on("session_start", async (_event, ctx) => {
		resetState();
		try {
			await loadForCwd(ctx.cwd);
			if (!state.catalog) return;
			const branch = ctx.sessionManager?.getBranch?.() ?? [];
			for (let index = branch.length - 1; index >= 0; index--) {
				const entry = branch[index];
				if (entry?.type !== "custom" || entry.customType !== SELECTION_ENTRY_TYPE) continue;
				const data = entry.data as { workspaceHash?: string; repo?: string } | undefined;
				if (data?.workspaceHash !== state.catalog.workspaceHash) continue;
				if (data.repo && state.catalog.repositories[data.repo]?.status === "active") state.selectedRepo = data.repo;
				break;
			}
		} catch (error) {
			resetState();
			notify(ctx, `Workspace memory disabled: ${(error as Error).message}`, "warning");
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		try {
			if (!state.catalog) await loadForCwd(ctx.cwd);
			if (!state.catalog || event.systemPrompt.includes(WORKSPACE_MEMORY_MARKER)) return;
			const repo = effectiveRepo(state.catalog, ctx.cwd);
			let live: GitSnapshot | undefined;
			if (repo?.status === "active") {
				live = await gitProbe(repo.realPath, now);
				const identity = `${repo.id}:${live.branch}:${live.head}`;
				if (state.lastLiveIdentity && state.lastLiveIdentity !== identity) {
					notify(ctx, `Workspace target changed to ${repo.id} ${live.branch}@${shortHead(live.head)}; branch memory will be revalidated.`, "warning");
				}
				state.lastLiveIdentity = identity;
			}
			return { systemPrompt: `${event.systemPrompt}\n\n${buildWorkspaceContext(state.catalog, repo?.id, live)}` };
		} catch (error) {
			notify(ctx, `Workspace memory skipped: ${(error as Error).message}`, "warning");
			return;
		}
	});

	pi.registerCommand("workspace", {
		description: "Initialize, inspect, select, and maintain machine-local workspace memory",
		handler: async (rawArgs, ctx) => {
			try {
				const args = parseArguments(rawArgs);
				const action = args.shift() ?? "help";
				if (action === "help") {
					notify(ctx, commandHelp());
					return;
				}
				if (action === "init") {
					const root = await fs.realpath(path.resolve(args.length ? args.join(" ") : ctx.cwd));
					const hash = workspaceHash(root);
					const filePath = catalogPath(agentDir, hash);
					const catalog = await withInterprocessLock(storageLock, async () => {
						let existing: WorkspaceCatalog | undefined;
						try {
							existing = await loadCatalog(filePath);
						} catch (error) {
							if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
						}
						const scanned = await scanWorkspace(root, existing, { now, gitProbe });
						await persistCatalogUnlocked(scanned);
						return scanned;
					});
					state.selectedRepo = undefined;
					notify(ctx, `Workspace initialized: ${catalog.workspaceRoot} (${Object.values(catalog.repositories).filter((repo) => repo.status === "active").length} repositories)`);
					return;
				}
				const catalog = await requireCatalog(ctx.cwd);
				if (action === "refresh") {
					const refreshed = await mutateCatalog((current) => scanWorkspace(current.workspaceRoot, current, { now, gitProbe }));
					notify(ctx, `Workspace refreshed: ${Object.values(refreshed.repositories).filter((repo) => repo.status === "active").length} active repositories`);
					return;
				}
				if (action === "list") {
					notify(ctx, formatCatalog(catalog));
					return;
				}
				const repoId = args.shift();
				if (!repoId) throw new Error(`${action} requires a repository id`);
				const repo = catalog.repositories[repoId];
				if (!repo) throw new Error(`Unknown workspace repository: ${repoId}`);
				if (action === "show") {
					const live = repo.status === "active" ? await gitProbe(repo.realPath, now) : undefined;
					notify(ctx, formatRepository(repo, live));
					return;
				}
				if (action === "use") {
					if (repo.status !== "active") throw new Error(`Repository is missing: ${repoId}`);
					state.selectedRepo = repoId;
					state.lastLiveIdentity = undefined;
					pi.appendEntry(SELECTION_ENTRY_TYPE, { workspaceHash: catalog.workspaceHash, repo: repoId });
					notify(ctx, `Workspace target selected: ${repoId}`);
					return;
				}
				if (action === "remember") {
					const branchScoped = args[0] === "--branch";
					if (branchScoped) args.shift();
					const note = validateNote(args.join(" "));
					await mutateCatalog(async (current) => {
						const currentRepo = current.repositories[repoId];
						if (!currentRepo) throw new Error(`Unknown workspace repository: ${repoId}`);
						if (branchScoped) {
							const live = await gitProbe(currentRepo.realPath, now);
							if (!live.available || live.branch === "DETACHED") throw new Error("Branch memory requires an attached readable Git branch");
							currentRepo.branchMemories[live.branch] = { head: live.head, note, confirmedAt: now() };
						} else {
							currentRepo.note = note;
						}
						current.updatedAt = now();
						return current;
					});
					notify(ctx, `Confirmed ${branchScoped ? "branch" : "repository"} memory for ${repoId}`);
					return;
				}
				if (action === "forget") {
					await mutateCatalog((current) => {
						const currentRepo = current.repositories[repoId];
						if (!currentRepo) throw new Error(`Unknown workspace repository: ${repoId}`);
						delete currentRepo.note;
						currentRepo.branchMemories = {};
						current.updatedAt = now();
						return current;
					});
					notify(ctx, `Forgot confirmed memory for ${repoId}; deterministic inventory remains.`);
					return;
				}
				if (action === "analyze") {
					if (repo.status !== "active") throw new Error(`Repository is missing: ${repoId}`);
					const live = await gitProbe(repo.realPath, now);
					const prompt = [
						`Analyze workspace repository ${repoId} with one bounded scout subagent.`,
						`Path: ${repo.realPath}`,
						`Local branch/HEAD: ${live.branch}@${live.head}; remote freshness is unknown.`,
						"Collect repository purpose, primary delivery role, and evidence-backed relationships to sibling repositories.",
						"Read no secrets, .env files, credential files, large manifests, or unrelated repositories.",
						"Return a candidate note under 12 lines with exact evidence paths and uncertainty.",
						`Do not save memory. Ask me to confirm it, then tell me to run /workspace remember ${repoId} <confirmed note>.`,
					].join("\n");
					pi.sendUserMessage(prompt, ctx.isIdle?.() === false ? { deliverAs: "followUp" } : undefined);
					notify(ctx, `Queued bounded analysis for ${repoId}`);
					return;
				}
				throw new Error(`Unknown /workspace action: ${action}`);
			} catch (error) {
				notify(ctx, (error as Error).message, "error");
			}
		},
	});

	pi.registerTool({
		name: "workspace_catalog",
		label: "Workspace Catalog",
		description: "Read the machine-local workspace inventory or details for one indexed repository. This tool never scans repository contents or mutates memory.",
		promptSnippet: "Read bounded machine-local workspace inventory and confirmed notes",
		promptGuidelines: [
			"Use workspace_catalog only for workspace orientation; revalidate repository files and Git state before decisions or edits.",
			"Do not treat workspace_catalog notes as deployment, remote, runtime, or secret truth.",
		],
		parameters: Type.Object({
			action: StringEnum(["current", "list", "show"] as const),
			repo: Type.Optional(Type.String({ minLength: 1 })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const catalog = await requireCatalog(ctx.cwd);
			if (params.action === "list") {
				const text = formatCatalog(catalog);
				return { content: [{ type: "text" as const, text }], details: { action: "list", workspaceHash: catalog.workspaceHash } };
			}
			const repo = params.action === "show"
				? params.repo && catalog.repositories[params.repo]
				: effectiveRepo(catalog, ctx.cwd);
			if (!repo) throw new Error(params.action === "show" ? `Unknown workspace repository: ${params.repo ?? ""}` : "No current workspace repository is selected");
			const live = repo.status === "active" ? await gitProbe(repo.realPath, now) : undefined;
			const text = formatRepository(repo, live);
			return { content: [{ type: "text" as const, text }], details: { action: params.action, workspaceHash: catalog.workspaceHash, repo: repo.id } };
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold(`workspace_catalog ${args.action}${args.repo ? ` ${args.repo}` : ""}`)), 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((item) => item.type === "text")?.text ?? "workspace_catalog";
			return new Text(theme.fg(result.isError ? "error" : "text", text), 0, 0);
		},
	});
}

export default function workspaceMemory(pi: ExtensionAPI): void {
	registerWorkspaceMemory(pi);
}
