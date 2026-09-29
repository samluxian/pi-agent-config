const SENSITIVE_NAME = "access[_-]?token|id[_-]?token|refresh[_-]?token|token|password|passwd|api[_-]?key|client[_-]?secret|secret|private[_-]?key|credential|aws[_-]?secret[_-]?access[_-]?key";
const SENSITIVE_ASSIGNMENT = new RegExp(`((?:"|')?(?:${SENSITIVE_NAME})(?:"|')?\\s*[:=]\\s*)("[^"]*"|'[^']*'|\\S+)`, "gi");
const SENSITIVE_FLAG = new RegExp(`(--(?:${SENSITIVE_NAME})\\s+)("[^"]*"|'[^']*'|\\S+)`, "gi");
const SENSITIVE_KEY = new RegExp(`^(?:${SENSITIVE_NAME})$`, "i");

export function redactSensitiveText(text: string): string {
	return text
		.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
		.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "[REDACTED JWT]")
		.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED ACCESS KEY]")
		.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED API KEY]")
		.replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[REDACTED]@")
		.replace(/(authorization\s*:\s*(?:bearer|basic))\s+\S+/gi, "$1 [REDACTED]")
		.replace(/\bbearer\s+\S+/gi, "Bearer [REDACTED]")
		.replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]")
		.replace(SENSITIVE_FLAG, "$1[REDACTED]");
}

export function boundedRedactedText(value: unknown, maxChars: number): string {
	const text = typeof value === "string" ? value : value == null ? "" : String(value);
	const redacted = redactSensitiveText(text).replaceAll("\u0000", "�");
	return redacted.length <= maxChars ? redacted : `${redacted.slice(0, maxChars - 3)}...`;
}

export function boundedRedactedNamedValue(name: string, value: unknown, maxChars: number): string {
	return SENSITIVE_KEY.test(name) ? "[REDACTED]" : boundedRedactedText(value, maxChars);
}
