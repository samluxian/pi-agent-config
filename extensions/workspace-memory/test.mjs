import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import workspaceMemory, {
	buildWorkspaceContext,
	registerWorkspaceMemory,
	SELECTION_ENTRY_TYPE,
	WORKSPACE_MEMORY_MARKER,
} from "./index.ts";
import {
	catalogPath,
	memoryRoot,
	MAX_CONTEXT_BYTES,
	MAX_CONTEXT_LINES,
	workspaceHash,
} from "./catalog.ts";

async function fixture() {
	const temp = await mkdtemp(path.join(os.tmpdir(), "workspace-memory-test-"));
	const agentDir = path.join(temp, "agent");
	const root = path.join(temp, "workspace");
	await mkdir(root, { recursive: true });
	const states = new Map();
	async function addRepo(name, files = []) {
		const repo = path.join(root, name);
		await mkdir(path.join(repo, ".git"), { recursive: true });
		for (const file of files) {
			await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
			await writeFile(path.join(repo, file), "fixture\n");
		}
		states.set(name, { branch: "main", head: `${name}-head-000000000000`, dirty: false });
		return repo;
	}
	const gitProbe = async (repoPath, now) => {
		const value = states.get(path.basename(repoPath));
		if (!value) return { available: false, branch: "UNKNOWN", head: "", dirty: true, checkedAt: now() };
		return { available: true, ...value, checkedAt: now() };
	};
	return { temp, agentDir, root, states, addRepo, gitProbe, cleanup: () => rm(temp, { recursive: true, force: true }) };
}

function harness({ agentDir, gitProbe, now = () => "2026-08-18T12:00:00.000Z", idle = true } = {}) {
	const handlers = new Map();
	const commands = new Map();
	const tools = new Map();
	const notifications = [];
	const entries = [];
	const sent = [];
	const pi = {
		on(name, handler) {
			handlers.set(name, handler);
		},
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		registerTool(definition) {
			tools.set(definition.name, definition);
		},
		appendEntry(customType, data) {
			entries.push({ type: "custom", customType, data });
		},
		sendUserMessage(message, options) {
			sent.push({ message, options });
		},
	};
	registerWorkspaceMemory(pi, { agentDir, gitProbe, now });
	const context = (cwd, branchEntries = []) => ({
		cwd,
		hasUI: true,
		isIdle: () => idle,
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
		sessionManager: {
			getBranch: () => branchEntries,
		},
	});
	return { handlers, commands, tools, notifications, entries, sent, context };
}

async function initWorkspace(h, root) {
	await h.commands.get("workspace").handler(`init "${root}"`, h.context(root));
}

test("registers one command, one read-only tool, and lifecycle hooks", () => {
	const handlers = new Map();
	const commands = new Map();
	const tools = new Map();
	workspaceMemory({
		on: (name, handler) => handlers.set(name, handler),
		registerCommand: (name, definition) => commands.set(name, definition),
		registerTool: (definition) => tools.set(definition.name, definition),
	});
	assert.ok(commands.has("workspace"));
	assert.ok(tools.has("workspace_catalog"));
	assert.equal(typeof handlers.get("session_start"), "function");
	assert.equal(typeof handlers.get("before_agent_start"), "function");
	assert.match(tools.get("workspace_catalog").description, /never scans repository contents or mutates memory/);
});

test("initializes deterministic inventory with private atomic storage and bounded context", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("api", ["package.json", "Dockerfile", ".github/workflows/test.yml"]);
	await f.addRepo("infra", ["main.tf", ".gitlab-ci.yml"]);
	await mkdir(path.join(f.root, "not-a-repo"));
	const h = harness(f);
	await initWorkspace(h, f.root);
	const hash = workspaceHash(await realpath(f.root));
	const file = catalogPath(f.agentDir, hash);
	const catalog = JSON.parse(await readFile(file, "utf8"));
	assert.deepEqual(Object.keys(catalog.repositories), ["api", "infra"]);
	assert.deepEqual(catalog.repositories.api.detectedTypes, ["container", "github-actions", "node"]);
	assert.deepEqual(catalog.repositories.infra.detectedTypes, ["gitlab-ci", "terraform"]);
	assert.equal((await stat(file)).mode & 0o777, 0o600);
	const hook = await h.handlers.get("before_agent_start")({ systemPrompt: "BASE" }, h.context(f.root));
	assert.match(hook.systemPrompt, new RegExp(WORKSPACE_MEMORY_MARKER));
	assert.ok(Buffer.byteLength(hook.systemPrompt.split(WORKSPACE_MEMORY_MARKER)[1], "utf8") <= MAX_CONTEXT_BYTES);
	assert.ok(hook.systemPrompt.split(/\r?\n/).length <= MAX_CONTEXT_LINES + 1);
	assert.match(hook.systemPrompt, /remote freshness before decisions or edits/);
});

test("remembers only explicit notes and marks branch memory stale after HEAD changes", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("service", ["package.json"]);
	const h = harness(f);
	await initWorkspace(h, f.root);
	const command = h.commands.get("workspace");
	await command.handler("use service", h.context(f.root));
	await command.handler("remember service Service deployment wrapper", h.context(f.root));
	await command.handler("remember service --branch Adds a bounded readiness probe", h.context(f.root));
	assert.equal(h.entries.at(-1).customType, SELECTION_ENTRY_TYPE);
	let result = await h.handlers.get("before_agent_start")({ systemPrompt: "BASE" }, h.context(f.root));
	assert.match(result.systemPrompt, /Confirmed branch memory: Adds a bounded readiness probe/);
	f.states.get("service").head = "service-new-head-999999";
	result = await h.handlers.get("before_agent_start")({ systemPrompt: "BASE" }, h.context(f.root));
	assert.match(result.systemPrompt, /Branch memory is stale/);
	assert.ok(h.notifications.some((entry) => entry.level === "warning" && /target changed/.test(entry.message)));
});

test("restores the selected repository from the active session branch", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	const repoPath = await f.addRepo("service", ["package.json"]);
	const first = harness(f);
	await initWorkspace(first, f.root);
	const hash = workspaceHash(await realpath(f.root));
	const second = harness(f);
	const branchEntries = [{ type: "custom", customType: SELECTION_ENTRY_TYPE, data: { workspaceHash: hash, repo: "service" } }];
	await second.handlers.get("session_start")({}, second.context(repoPath, branchEntries));
	const result = await second.handlers.get("before_agent_start")({ systemPrompt: "BASE" }, second.context(repoPath, branchEntries));
	assert.match(result.systemPrompt, /Selected repository: service/);
});

test("refresh preserves confirmed memory and marks removed repositories missing", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	const repoPath = await f.addRepo("service", ["package.json"]);
	const h = harness(f);
	await initWorkspace(h, f.root);
	await h.commands.get("workspace").handler("remember service Stable purpose", h.context(f.root));
	await rm(repoPath, { recursive: true, force: true });
	await h.commands.get("workspace").handler("refresh", h.context(f.root));
	const tool = h.tools.get("workspace_catalog");
	const result = await tool.execute("call", { action: "show", repo: "service" }, undefined, undefined, h.context(f.root));
	const text = result.content[0].text;
	assert.match(text, /Status: missing/);
	assert.match(text, /Repository note: Stable purpose/);
});

test("analyze queues a bounded scout request but does not persist model output", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("service", ["package.json"]);
	const h = harness({ ...f, idle: false });
	await initWorkspace(h, f.root);
	await h.commands.get("workspace").handler("analyze service", h.context(f.root));
	assert.equal(h.sent.length, 1);
	assert.equal(h.sent[0].options.deliverAs, "followUp");
	assert.match(h.sent[0].message, /one bounded scout subagent/);
	assert.match(h.sent[0].message, /Do not save memory/);
	const toolResult = await h.tools.get("workspace_catalog").execute("call", { action: "show", repo: "service" }, undefined, undefined, h.context(f.root));
	assert.match(toolResult.content[0].text, /Repository note: none/);
});

test("forget removes annotations without deleting deterministic inventory", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("service", ["package.json"]);
	const h = harness(f);
	await initWorkspace(h, f.root);
	await h.commands.get("workspace").handler("remember service Stable purpose", h.context(f.root));
	await h.commands.get("workspace").handler("forget service", h.context(f.root));
	const result = await h.tools.get("workspace_catalog").execute("call", { action: "list" }, undefined, undefined, h.context(f.root));
	assert.match(result.content[0].text, /service \[active; node\]/);
	assert.doesNotMatch(result.content[0].text, /Stable purpose/);
});

test("rejects symlinked Git markers and keeps existing storage directories private", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("valid", ["package.json"]);
	const externalGit = path.join(f.temp, "external-git");
	await mkdir(externalGit);
	const linkedRepo = path.join(f.root, "linked");
	await mkdir(linkedRepo);
	await symlink(externalGit, path.join(linkedRepo, ".git"));
	const storageRoot = path.join(f.agentDir, "workspace-memory");
	await mkdir(storageRoot, { recursive: true, mode: 0o777 });
	await chmod(storageRoot, 0o777);
	const h = harness(f);
	await initWorkspace(h, f.root);
	const result = await h.tools.get("workspace_catalog").execute("call", { action: "list" }, undefined, undefined, h.context(f.root));
	assert.match(result.content[0].text, /valid/);
	assert.doesNotMatch(result.content[0].text, /linked/);
	assert.equal((await stat(storageRoot)).mode & 0o777, 0o700);
	assert.equal((await stat(path.dirname(catalogPath(f.agentDir, workspaceHash(await realpath(f.root)))))).mode & 0o777, 0o700);
});

test("rejects forged registry keys and repository paths", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("service", ["package.json"]);
	const h = harness(f);
	await initWorkspace(h, f.root);
	const hash = workspaceHash(await realpath(f.root));
	const file = catalogPath(f.agentDir, hash);
	const catalog = JSON.parse(await readFile(file, "utf8"));
	catalog.repositories.service.realPath = path.join(f.temp, "outside");
	await writeFile(file, JSON.stringify(catalog), { mode: 0o600 });
	const reloaded = harness(f);
	await reloaded.handlers.get("session_start")({}, reloaded.context(f.root));
	assert.ok(reloaded.notifications.some((entry) => entry.level === "warning" && /disabled/.test(entry.message)));

	await writeFile(path.join(f.agentDir, "workspace-memory", "registry.json"), JSON.stringify({
		schemaVersion: 1,
		roots: { "../../outside": { root: await realpath(f.root), updatedAt: "now" } },
	}), { mode: 0o600 });
	const traversal = harness(f);
	await traversal.handlers.get("session_start")({}, traversal.context(f.root));
	assert.ok(traversal.notifications.some((entry) => entry.level === "warning" && /disabled/.test(entry.message)));
});

test("recovers a storage lock left by a dead process", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("service", ["package.json"]);
	const storageRoot = memoryRoot(f.agentDir);
	await mkdir(storageRoot, { recursive: true });
	await writeFile(path.join(storageRoot, ".catalog.lock"), `${process.pid + 1_000_000}\n`, { mode: 0o600 });
	const h = harness(f);
	await initWorkspace(h, f.root);
	assert.ok(h.notifications.some((entry) => /Workspace initialized/.test(entry.message)));
});

test("concurrent extension instances reload under the storage lock before mutation", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("api", ["package.json"]);
	await f.addRepo("worker", ["package.json"]);
	const first = harness(f);
	await initWorkspace(first, f.root);
	const second = harness(f);
	await second.handlers.get("session_start")({}, second.context(f.root));
	await Promise.all([
		first.commands.get("workspace").handler("remember api API purpose", first.context(f.root)),
		second.commands.get("workspace").handler("remember worker Worker purpose", second.context(f.root)),
	]);
	const hash = workspaceHash(await realpath(f.root));
	const catalog = JSON.parse(await readFile(catalogPath(f.agentDir, hash), "utf8"));
	assert.equal(catalog.repositories.api.note, "API purpose");
	assert.equal(catalog.repositories.worker.note, "Worker purpose");
});

test("session restoration skips newer selections from another workspace", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	const repoPath = await f.addRepo("service", ["package.json"]);
	const first = harness(f);
	await initWorkspace(first, f.root);
	const hash = workspaceHash(await realpath(f.root));
	const entries = [
		{ type: "custom", customType: SELECTION_ENTRY_TYPE, data: { workspaceHash: hash, repo: "service" } },
		{ type: "custom", customType: SELECTION_ENTRY_TYPE, data: { workspaceHash: "ffffffffffffffff", repo: "other" } },
	];
	const second = harness(f);
	await second.handlers.get("session_start")({}, second.context(repoPath, entries));
	const result = await second.handlers.get("before_agent_start")({ systemPrompt: "BASE" }, second.context(repoPath, entries));
	assert.match(result.systemPrompt, /Selected repository: service/);
});

test("a newer invalid selection in the same workspace clears an older selection", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await f.addRepo("service", ["package.json"]);
	const first = harness(f);
	await initWorkspace(first, f.root);
	const hash = workspaceHash(await realpath(f.root));
	const entries = [
		{ type: "custom", customType: SELECTION_ENTRY_TYPE, data: { workspaceHash: hash, repo: "service" } },
		{ type: "custom", customType: SELECTION_ENTRY_TYPE, data: { workspaceHash: hash, repo: "removed" } },
	];
	const second = harness(f);
	await second.handlers.get("session_start")({}, second.context(f.root, entries));
	const result = await second.handlers.get("before_agent_start")({ systemPrompt: "BASE" }, second.context(f.root, entries));
	assert.doesNotMatch(result.systemPrompt, /Selected repository:/);
});

test("context builder enforces UTF-8 byte and line budgets", () => {
	const repositories = {};
	for (let i = 0; i < 100; i++) {
		const id = `repo-${String(i).padStart(3, "0")}`;
		repositories[id] = {
			id,
			name: id,
			relativePath: id,
			realPath: `/workspace/${id}`,
			status: "active",
			detectedTypes: ["node"],
			git: { available: true, branch: "main", head: "a".repeat(40), dirty: false, checkedAt: "now" },
			note: "多位元內容".repeat(100),
			branchMemories: {},
		};
	}
	const text = buildWorkspaceContext({
		schemaVersion: 1,
		workspaceHash: "hash",
		workspaceRoot: "/workspace",
		createdAt: "now",
		updatedAt: "now",
		repositories,
	});
	assert.ok(Buffer.byteLength(text, "utf8") <= MAX_CONTEXT_BYTES);
	assert.ok(text.split(/\r?\n/).length <= MAX_CONTEXT_LINES);
	assert.match(text, /workspace memory truncated|more; query workspace_catalog/);
});

test("malformed registry disables memory visibly without changing the base prompt", async (t) => {
	const f = await fixture();
	t.after(f.cleanup);
	await mkdir(path.join(f.agentDir, "workspace-memory"), { recursive: true });
	await writeFile(path.join(f.agentDir, "workspace-memory", "registry.json"), "{not json", { mode: 0o600 });
	const h = harness(f);
	await h.handlers.get("session_start")({}, h.context(f.root));
	const result = await h.handlers.get("before_agent_start")({ systemPrompt: "BASE" }, h.context(f.root));
	assert.equal(result, undefined);
	assert.ok(h.notifications.some((entry) => entry.level === "warning" && /disabled|skipped/.test(entry.message)));
});
