import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SCOUT_SCOPE_ENV = "PI_SCOUT_ALLOWED_PATHS";
const PATH_TOOLS = new Set(["read", "grep", "find", "ls"]);

function canonicalPath(target: string): string {
	try {
		return fs.realpathSync(target);
	} catch (error) {
		if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
		const parent = path.dirname(target);
		if (parent === target) throw error;
		return path.join(canonicalPath(parent), path.basename(target));
	}
}

export function normalizeScoutScope(paths: string[], cwd: string): string[] {
	if (!paths.length) throw new Error("Scout requires explicit allowedPaths directories.");
	return [...new Set(paths.map((entry) => {
		if (!entry.trim()) throw new Error("Scout allowedPaths must not contain empty paths.");
		const resolved = fs.realpathSync(path.resolve(cwd, entry));
		if (!fs.statSync(resolved).isDirectory()) throw new Error("Scout allowedPaths entries must be existing directories.");
		return resolved;
	}))];
}

export function checkScoutPath(tool: string, input: Record<string, unknown>, cwd: string, roots: string[]): string | undefined {
	if (!PATH_TOOLS.has(tool)) return "Scout scope guard rejects tools outside its read-only path allowlist.";
	if (!roots.length) return "Scout scope guard has no allowed directories.";
	if (input.path !== undefined && typeof input.path !== "string") return "Scout path must be a string.";
	const rawPath = (input.path as string | undefined) || ".";
	// Pi expands these spellings; reject ambiguity rather than checking a different path.
	if (/^(?:@|~|file:)/.test(rawPath) || /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/.test(rawPath)) {
		return "Scout requires ordinary absolute or relative filesystem paths, without @, tilde, URL or Unicode-space expansion.";
	}
	const target = path.resolve(cwd, rawPath);
	const contained = (candidate: string) => roots.some((root) => {
		const relative = path.relative(root, candidate);
		return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
	});
	if (!contained(target)) return "Scout path is outside allowedPaths. Use an explicit permitted search directory; do not widen scope.";
	try {
		if (!contained(canonicalPath(target))) return "Scout path resolves through a symlink outside allowedPaths.";
	} catch {
		return "Scout path cannot be safely resolved. Report the access limit.";
	}
	if (tool === "read" && !fs.existsSync(target)) {
		return "Scout read target does not exist. Use one bounded discovery check inside allowedPaths, then report the gap; do not guess alternatives.";
	}
	return undefined;
}

export default function (pi: ExtensionAPI) {
	let roots: string[] = [];
	try {
		const value = JSON.parse(process.env[SCOUT_SCOPE_ENV] ?? "[]");
		if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
			roots = normalizeScoutScope(value, process.cwd());
		}
	} catch {
		// Fail closed: invalid configuration never grants access.
	}
	pi.on("tool_call", (event, ctx) => {
		const reason = checkScoutPath(event.toolName, event.input, ctx.cwd, roots);
		return reason ? { block: true, reason } : undefined;
	});
}
