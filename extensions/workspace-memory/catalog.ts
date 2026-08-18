import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const SCHEMA_VERSION = 1;
export const MAX_CATALOG_BYTES = 1024 * 1024;
export const MAX_CONTEXT_BYTES = 4 * 1024;
export const MAX_CONTEXT_LINES = 40;
export const MAX_NOTE_BYTES = 2 * 1024;
export const MAX_NOTE_LINES = 12;
export const MAX_TOOL_BYTES = 8 * 1024;
export const MAX_TOOL_LINES = 80;
const GIT_TIMEOUT_MS = 3_000;
const GIT_MAX_BUFFER = 128 * 1024;
const SCAN_CONCURRENCY = 4;
const LOCK_WAIT_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 15 * 60_000;
const WORKSPACE_HASH_PATTERN = /^[a-f0-9]{16}$/;

export interface GitSnapshot {
	available: boolean;
	branch: string;
	head: string;
	dirty: boolean;
	checkedAt: string;
}

export interface BranchMemory {
	head: string;
	note: string;
	confirmedAt: string;
}

export interface RepositoryMemory {
	id: string;
	name: string;
	relativePath: string;
	realPath: string;
	status: "active" | "missing";
	detectedTypes: string[];
	git: GitSnapshot;
	note?: string;
	branchMemories: Record<string, BranchMemory>;
}

export interface WorkspaceCatalog {
	schemaVersion: 1;
	workspaceHash: string;
	workspaceRoot: string;
	createdAt: string;
	updatedAt: string;
	repositories: Record<string, RepositoryMemory>;
}

interface RegistryEntry {
	root: string;
	updatedAt: string;
}

interface WorkspaceRegistry {
	schemaVersion: 1;
	roots: Record<string, RegistryEntry>;
}

export type GitProbe = (repoPath: string, now: () => string) => Promise<GitSnapshot>;

export interface CatalogDependencies {
	now?: () => string;
	gitProbe?: GitProbe;
}

function execGit(args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			"git",
			["--no-optional-locks", "-C", cwd, ...args],
			{
				encoding: "utf8",
				timeout: GIT_TIMEOUT_MS,
				maxBuffer: GIT_MAX_BUFFER,
				env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
			},
			(error, stdout) => {
				if (error) reject(error);
				else resolve(String(stdout).trim());
			},
		);
	});
}

export const defaultGitProbe: GitProbe = async (repoPath, now) => {
	try {
		await execGit(["rev-parse", "--is-inside-work-tree"], repoPath);
		const head = await execGit(["rev-parse", "HEAD"], repoPath);
		let branch = "DETACHED";
		try {
			branch = (await execGit(["symbolic-ref", "--quiet", "--short", "HEAD"], repoPath)) || "DETACHED";
		} catch {
			// A detached HEAD is valid and has no symbolic branch.
		}
		let dirty = true;
		try {
			dirty = (await execGit(["status", "--porcelain=v1", "--untracked-files=normal"], repoPath)).length > 0;
		} catch {
			// Treat an unreadable status as unsafe rather than clean.
		}
		return { available: true, branch, head, dirty, checkedAt: now() };
	} catch {
		return { available: false, branch: "UNKNOWN", head: "", dirty: true, checkedAt: now() };
	}
};

export function workspaceHash(root: string): string {
	return createHash("sha256").update(root).digest("hex").slice(0, 16);
}

export function memoryRoot(agentDir: string): string {
	return path.join(agentDir, "workspace-memory");
}

export function registryPath(agentDir: string): string {
	return path.join(memoryRoot(agentDir), "registry.json");
}

export function catalogPath(agentDir: string, hash: string): string {
	return path.join(memoryRoot(agentDir), hash, "catalog.json");
}

async function readBoundedJson(filePath: string, maxBytes = MAX_CATALOG_BYTES): Promise<unknown> {
	const stat = await fs.stat(filePath);
	if (stat.size > maxBytes) throw new Error(`Memory file exceeds ${maxBytes} bytes: ${filePath}`);
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateCatalog(value: unknown): WorkspaceCatalog {
	if (!isStringRecord(value) || value.schemaVersion !== SCHEMA_VERSION) {
		throw new Error("Unsupported or missing workspace-memory schemaVersion");
	}
	if (typeof value.workspaceRoot !== "string" || typeof value.workspaceHash !== "string") {
		throw new Error("Workspace catalog is missing root identity");
	}
	if (!WORKSPACE_HASH_PATTERN.test(value.workspaceHash) || workspaceHash(value.workspaceRoot) !== value.workspaceHash) {
		throw new Error("Workspace catalog root/hash identity mismatch");
	}
	if (!path.isAbsolute(value.workspaceRoot) || path.normalize(value.workspaceRoot) !== value.workspaceRoot) {
		throw new Error("Workspace catalog root must be a normalized absolute path");
	}
	if (!isStringRecord(value.repositories)) throw new Error("Workspace catalog repositories must be an object");
	for (const [id, repo] of Object.entries(value.repositories)) {
		if (!isStringRecord(repo) || repo.id !== id || typeof repo.realPath !== "string") {
			throw new Error(`Invalid repository entry: ${id}`);
		}
		if (repo.relativePath !== id || path.basename(id) !== id || id === "." || id === "..") {
			throw new Error(`Invalid repository identity: ${id}`);
		}
		const expectedPath = path.join(value.workspaceRoot, id);
		if (repo.realPath !== expectedPath || path.dirname(repo.realPath) !== value.workspaceRoot) {
			throw new Error(`Repository path escapes workspace root: ${id}`);
		}
		if (repo.status !== "active" && repo.status !== "missing") throw new Error(`Invalid repository status: ${id}`);
		if (!Array.isArray(repo.detectedTypes) || !isStringRecord(repo.branchMemories)) {
			throw new Error(`Invalid repository metadata: ${id}`);
		}
	}
	return value as unknown as WorkspaceCatalog;
}

function validateRegistry(value: unknown): WorkspaceRegistry {
	if (!isStringRecord(value) || value.schemaVersion !== SCHEMA_VERSION || !isStringRecord(value.roots)) {
		throw new Error("Invalid workspace-memory registry");
	}
	for (const [hash, entry] of Object.entries(value.roots)) {
		if (!WORKSPACE_HASH_PATTERN.test(hash) || !isStringRecord(entry) || typeof entry.root !== "string" || typeof entry.updatedAt !== "string") {
			throw new Error("Invalid workspace-memory registry entry");
		}
		if (!path.isAbsolute(entry.root) || path.normalize(entry.root) !== entry.root || workspaceHash(entry.root) !== hash) {
			throw new Error("Workspace-memory registry root/hash mismatch");
		}
	}
	return value as unknown as WorkspaceRegistry;
}

export async function loadCatalog(filePath: string): Promise<WorkspaceCatalog> {
	return validateCatalog(await readBoundedJson(filePath));
}

export async function loadRegistry(agentDir: string): Promise<WorkspaceRegistry> {
	try {
		return validateRegistry(await readBoundedJson(registryPath(agentDir), 128 * 1024));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, roots: {} };
		throw error;
	}
}

async function ensurePrivateDirectory(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true, mode: 0o700 });
	await fs.chmod(dirPath, 0o700);
}

async function lockOwnerIsAlive(lockPath: string): Promise<boolean | undefined> {
	try {
		const pid = Number.parseInt((await fs.readFile(lockPath, "utf8")).trim(), 10);
		if (!Number.isInteger(pid) || pid <= 0) return undefined;
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			return (error as NodeJS.ErrnoException).code === "ESRCH" ? false : true;
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		return undefined;
	}
}

export async function withInterprocessLock<T>(lockPath: string, task: () => Promise<T>): Promise<T> {
	await ensurePrivateDirectory(path.dirname(lockPath));
	const started = Date.now();
	let handle: fs.FileHandle | undefined;
	while (!handle) {
		try {
			handle = await fs.open(lockPath, "wx", 0o600);
			await handle.writeFile(`${process.pid}\n`, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			try {
				const [lockStat, ownerAlive] = await Promise.all([fs.stat(lockPath), lockOwnerIsAlive(lockPath)]);
				if (ownerAlive === false || (ownerAlive === undefined && Date.now() - lockStat.mtimeMs > LOCK_STALE_MS)) {
					await fs.rm(lockPath, { force: true });
					continue;
				}
			} catch (statError) {
				if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw statError;
			}
			if (Date.now() - started >= LOCK_TIMEOUT_MS) throw new Error("Timed out waiting for workspace-memory storage lock");
			await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
		}
	}
	try {
		return await task();
	} finally {
		await handle.close().catch(() => undefined);
		await fs.rm(lockPath, { force: true }).catch(() => undefined);
	}
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
	await ensurePrivateDirectory(path.dirname(filePath));
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	const body = `${JSON.stringify(value, null, 2)}\n`;
	try {
		await fs.writeFile(tempPath, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
		await fs.rename(tempPath, filePath);
		await fs.chmod(filePath, 0o600);
	} finally {
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
	}
}

export async function registerWorkspace(agentDir: string, catalog: WorkspaceCatalog): Promise<void> {
	const registry = await loadRegistry(agentDir);
	registry.roots[catalog.workspaceHash] = { root: catalog.workspaceRoot, updatedAt: catalog.updatedAt };
	await atomicWriteJson(registryPath(agentDir), registry);
}

export async function findCatalogForCwd(agentDir: string, cwd: string): Promise<string | undefined> {
	const registry = await loadRegistry(agentDir);
	const realCwd = await fs.realpath(cwd);
	const matches = Object.entries(registry.roots)
		.filter(([, entry]) => realCwd === entry.root || realCwd.startsWith(`${entry.root}${path.sep}`))
		.sort((a, b) => b[1].root.length - a[1].root.length);
	return matches.length ? catalogPath(agentDir, matches[0][0]) : undefined;
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function isSafeGitMarker(filePath: string): Promise<boolean> {
	try {
		const marker = await fs.lstat(filePath);
		return !marker.isSymbolicLink() && (marker.isDirectory() || marker.isFile());
	} catch {
		return false;
	}
}

async function detectTypes(repoPath: string): Promise<string[]> {
	const types = new Set<string>();
	const checks: Array<[string, string]> = [
		["package.json", "node"],
		["Chart.yaml", "helm"],
		["kustomization.yaml", "kustomize"],
		["kustomization.yml", "kustomize"],
		["pom.xml", "java"],
		["build.gradle", "java"],
		["build.gradle.kts", "java"],
		["Dockerfile", "container"],
		[".gitlab-ci.yml", "gitlab-ci"],
	];
	await Promise.all(checks.map(async ([name, type]) => {
		if (await exists(path.join(repoPath, name))) types.add(type);
	}));
	if (await exists(path.join(repoPath, ".github", "workflows"))) types.add("github-actions");
	try {
		const names = await fs.readdir(repoPath);
		if (names.some((name) => name.endsWith(".tf"))) types.add("terraform");
	} catch {
		// Type detection is best effort and never reads file contents.
	}
	return [...types].sort();
}

async function mapConcurrent<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	async function worker() {
		while (true) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await task(items[index]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
	return results;
}

export async function scanWorkspace(
	requestedRoot: string,
	existing?: WorkspaceCatalog,
	dependencies: CatalogDependencies = {},
): Promise<WorkspaceCatalog> {
	const now = dependencies.now ?? (() => new Date().toISOString());
	const gitProbe = dependencies.gitProbe ?? defaultGitProbe;
	const root = await fs.realpath(requestedRoot);
	const rootStat = await fs.stat(root);
	if (!rootStat.isDirectory()) throw new Error(`Workspace root is not a directory: ${requestedRoot}`);
	const entries = (await fs.readdir(root, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
		.sort((a, b) => a.name.localeCompare(b.name));
	const repoEntries: Array<{ id: string; repoPath: string }> = [];
	for (const entry of entries) {
		const repoPath = path.join(root, entry.name);
		if (await isSafeGitMarker(path.join(repoPath, ".git"))) repoEntries.push({ id: entry.name, repoPath });
	}
	const timestamp = now();
	const scanned = await mapConcurrent(repoEntries, SCAN_CONCURRENCY, async ({ id, repoPath }) => {
		const previous = existing?.repositories[id];
		return {
			id,
			name: id,
			relativePath: id,
			realPath: await fs.realpath(repoPath),
			status: "active" as const,
			detectedTypes: await detectTypes(repoPath),
			git: await gitProbe(repoPath, now),
			...(previous?.note ? { note: previous.note } : {}),
			branchMemories: previous?.branchMemories ?? {},
		};
	});
	const repositories = Object.fromEntries(scanned.map((repo) => [repo.id, repo]));
	if (existing?.workspaceRoot === root) {
		for (const [id, previous] of Object.entries(existing.repositories)) {
			if (!repositories[id]) repositories[id] = { ...previous, status: "missing" };
		}
	}
	return {
		schemaVersion: 1,
		workspaceHash: workspaceHash(root),
		workspaceRoot: root,
		createdAt: existing?.workspaceRoot === root ? existing.createdAt : timestamp,
		updatedAt: timestamp,
		repositories,
	};
}

export function validateNote(note: string): string {
	const value = note.trim();
	if (!value) throw new Error("Memory note must not be empty");
	if (value.split(/\r?\n/).length > MAX_NOTE_LINES) throw new Error(`Memory note exceeds ${MAX_NOTE_LINES} lines`);
	if (Buffer.byteLength(value, "utf8") > MAX_NOTE_BYTES) throw new Error(`Memory note exceeds ${MAX_NOTE_BYTES} UTF-8 bytes`);
	return value;
}

export function boundText(text: string, maxLines: number, maxBytes: number): string {
	const lines = text.split(/\r?\n/);
	let bounded = lines.slice(0, maxLines).join("\n");
	let truncated = lines.length > maxLines;
	while (Buffer.byteLength(bounded, "utf8") > maxBytes && bounded.length > 0) {
		bounded = bounded.slice(0, Math.max(0, bounded.length - 128));
		truncated = true;
	}
	if (truncated) {
		const suffix = "\n… workspace memory truncated; use workspace_catalog for details";
		while (Buffer.byteLength(`${bounded}${suffix}`, "utf8") > maxBytes && bounded.length > 0) bounded = bounded.slice(0, -32);
		bounded = `${bounded.trimEnd()}${suffix}`;
	}
	return bounded;
}

export function repoForPath(catalog: WorkspaceCatalog, cwd: string): RepositoryMemory | undefined {
	const normalized = path.resolve(cwd);
	return Object.values(catalog.repositories)
		.filter((repo) => repo.status === "active" && (normalized === repo.realPath || normalized.startsWith(`${repo.realPath}${path.sep}`)))
		.sort((a, b) => b.realPath.length - a.realPath.length)[0];
}
