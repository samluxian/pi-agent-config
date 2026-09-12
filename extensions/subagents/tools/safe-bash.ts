/**
 * Child-only safe_bash extension adapted from amosblomqvist/pi-subagents.
 * This is a blocklist safety layer, not a sandbox or an approval mechanism.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DANGEROUS_PATTERNS = [
	/\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?(\/|~\/?\s|~\/?\b)/,
	/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(-[a-zA-Z]*f[a-zA-Z]*\s+)?(\/|~\/?\s|~\/?\b)/,
	/\bsudo\b/,
	/\bmkfs\b/,
	/\bdd\s+if=/,
	/:\(\)\s*\{\s*:\|:&\s*\}\s*;:/,
	/>\s*\/dev\/[sh]d[a-z]/,
	/\bchmod\s+(-[a-zA-Z]+\s+)?777\s+\//,
	/\bchown\s+(-[a-zA-Z]+\s+)?root/,
	/\bcurl\s.*\|\s*(ba)?sh/,
	/\bwget\s.*\|\s*(ba)?sh/,
	/\bshutdown\b/,
	/\breboot\b/,
	/\binit\s+0\b/,
	/\bkill\s+-9\s+1\b/,
	/\bkillall\b/,
];

export function dangerousCommandReason(command: string): string | undefined {
	const normalized = command.replace(/\\\n/g, " ");
	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(normalized)) {
			return `Command blocked by safe_bash: matches dangerous pattern ${pattern}`;
		}
	}
	return undefined;
}

// fallow-ignore-next-line unused-export -- loaded dynamically through TOOL_EXTENSION_PATHS
export default function (pi: ExtensionAPI) {
	const bashTool = createBashTool(process.cwd());

	pi.registerTool({
		name: "safe_bash",
		label: "Safe Bash",
		description: "Execute a bounded local bash command after blocking known destructive patterns. This is not a sandbox.",
		parameters: Type.Object({
			command: Type.String({ description: "Bounded local command to execute" }),
			timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
		}),
		async execute(toolCallId, params, signal, onUpdate) {
			const reason = dangerousCommandReason(params.command);
			if (reason) throw new Error(reason);
			return bashTool.execute(toolCallId, params, signal, onUpdate);
		},
	});
}
