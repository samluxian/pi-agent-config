import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { SupportedProcessor } from "./types.ts";

export const MAX_PROCESSOR_INPUT_BYTES = 64 * 1024 * 1024;

const SHELL_CONTROL = /[\r\n;&|<>`\\#()]|\$[({]/;
const TERRAFORM_PLAN = /^(?:(?:\.\/)?[A-Za-z0-9_./-]*run-terraform\.sh\s+plan\b|(?:terraform|tofu)\s+plan\b)/;
const HELM_TEMPLATE = /^helm\s+template\b/;
const HELM_DRY_RUN = /^helm\s+(?:install|upgrade)\b[\s\S]*\s--dry-run(?:=\S+)?(?:\s|$)/;
const PI_BASH_TEMP_FILE = /^pi-bash-[a-f0-9]{16}\.log$/;
const TERRAFORM_UNSUPPORTED_OUTPUT = /(?:^|\s)-(?:json(?:\s|$)|out(?:=|\s))/;
const HELM_OUTPUT_DIRECTORY = /(?:^|\s)--output-dir(?:=|\s)/;
const TEST_COMMAND = /^(?:(?:npm|pnpm|yarn|bun)\s+(?:(?:run\s+)?test(?::[A-Za-z0-9_.:-]+)?)(?:\s|$)|node\s+[^\r\n]*--test(?:\s|$)|(?:python(?:3(?:\.\d+)?)?|py)\s+(?:-m\s+(?:unittest|pytest)\b|[^\r\n]*?(?:test|tests)[^\s]*\.py\b)|pytest\b|bash\s+[^\r\n]*?(?:test|tests)[^\s]*\.sh\b|(?:\.\/)?[^\s]*(?:test|tests)[^\s]*\.sh\b)/i;
const NATIVE_FULL_OUTPUT = /Full output:\s*(\/[^\]\r\n]+\/pi-bash-[a-f0-9]{16}\.log)\]/;
const LEADING_CD = /^cd\s+(?:"[^"\r\n]+"|'[^'\r\n]+'|[A-Za-z0-9_./~-]+)\s*&&\s*(.+)$/;
const LEADING_ENV = /^(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s;&|<>`\\#()]+)\s+)+(.+)$/;

function commandPayload(command: string): string | undefined {
	let normalized = command.trim();
	const cd = normalized.match(LEADING_CD);
	if (cd) normalized = cd[1].trim();
	const environment = normalized.match(LEADING_ENV);
	if (environment) normalized = environment[1].trim();
	return normalized && !SHELL_CONTROL.test(normalized) ? normalized : undefined;
}

export function classifyCommand(command: unknown): SupportedProcessor | undefined {
	if (typeof command !== "string") return undefined;
	const normalized = commandPayload(command);
	if (!normalized) return undefined;
	if (TERRAFORM_PLAN.test(normalized) && !TERRAFORM_UNSUPPORTED_OUTPUT.test(normalized)) return "terraform-plan";
	if ((HELM_TEMPLATE.test(normalized) || HELM_DRY_RUN.test(normalized)) && !HELM_OUTPUT_DIRECTORY.test(normalized)) return "helm-manifest";
	if (TEST_COMMAND.test(normalized)) return "test-result";
	return undefined;
}

export function fullOutputPath(details: unknown): string | undefined {
	if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
	const record = details as Record<string, unknown>;
	const truncation = record.truncation;
	if (!truncation || typeof truncation !== "object" || Array.isArray(truncation)) return undefined;
	if ((truncation as Record<string, unknown>).truncated !== true) return undefined;
	return typeof record.fullOutputPath === "string" ? record.fullOutputPath : undefined;
}

export function fullOutputPathFromNativeError(text: string): string | undefined {
	return text.match(NATIVE_FULL_OUTPUT)?.[1];
}

export async function openSafeBashOutput(path: string): Promise<FileHandle | undefined> {
	if (!isAbsolute(path) || !PI_BASH_TEMP_FILE.test(basename(path))) return undefined;
	const resolvedPath = resolve(path);

	let handle: FileHandle | undefined;
	try {
		const supplied = await lstat(resolvedPath);
		if (!supplied.isFile() || supplied.isSymbolicLink()) return undefined;
		const canonicalPath = await realpath(resolvedPath);
		const canonicalTemp = await realpath(tmpdir());
		const relativePath = relative(canonicalTemp, canonicalPath);
		if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
		const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
		handle = await open(canonicalPath, constants.O_RDONLY | noFollow);
		const stat = await handle.stat();
		if (
			!stat.isFile()
			|| stat.dev !== supplied.dev
			|| stat.ino !== supplied.ino
			|| stat.size < 1
			|| stat.size > MAX_PROCESSOR_INPUT_BYTES
		) {
			await handle.close();
			return undefined;
		}
		return handle;
	} catch {
		if (handle) await handle.close().catch(() => undefined);
		return undefined;
	}
}
