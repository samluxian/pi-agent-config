import { Buffer } from "node:buffer";
import { boundedRedactedNamedValue, boundedRedactedText, redactSensitiveText } from "../redaction.ts";
import type { EnvironmentProcessorResult } from "../types.ts";

const MAX_STRING_CHARS = 2_048;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_DEPTH = 4;

interface ProjectionState {
	contentComplete: boolean;
	redactedFieldCount: number;
	truncatedStringCount: number;
	omittedObjectKeyCount: number;
	omittedArrayItemCount: number;
}

function projectValue(value: unknown, key: string, depth: number, state: ProjectionState): unknown {
	if (key && boundedRedactedNamedValue(key, value, MAX_STRING_CHARS) === "[REDACTED]") {
		state.contentComplete = false;
		state.redactedFieldCount += 1;
		return "[REDACTED]";
	}
	if (typeof value === "string") {
		const redacted = redactSensitiveText(value).replaceAll("\u0000", "�");
		if (redacted !== value) {
			state.contentComplete = false;
			state.redactedFieldCount += 1;
		}
		if (redacted.length <= MAX_STRING_CHARS) return redacted;
		state.contentComplete = false;
		state.truncatedStringCount += 1;
		const headChars = Math.floor(MAX_STRING_CHARS * 3 / 4);
		const tailChars = MAX_STRING_CHARS - headChars;
		return `${redacted.slice(0, headChars)}...[truncated ${redacted.length - MAX_STRING_CHARS} chars]...${redacted.slice(-tailChars)}`;
	}
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (depth >= MAX_DEPTH) {
		state.contentComplete = false;
		return "[nested value omitted at depth limit]";
	}
	if (Array.isArray(value)) {
		if (value.length > MAX_ARRAY_ITEMS) {
			state.contentComplete = false;
			state.omittedArrayItemCount += value.length - MAX_ARRAY_ITEMS;
		}
		return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => projectValue(entry, "", depth + 1, state));
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length > MAX_OBJECT_KEYS) {
			state.contentComplete = false;
			state.omittedObjectKeyCount += entries.length - MAX_OBJECT_KEYS;
		}
		return Object.fromEntries(entries.slice(0, MAX_OBJECT_KEYS).map(([entryKey, entryValue]) => [
			boundedRedactedText(entryKey, 120),
			projectValue(entryValue, entryKey, depth + 1, state),
		]));
	}
	return boundedRedactedText(value, 120);
}

export function summarizePodLogs(stdout: string): EnvironmentProcessorResult | undefined {
	const redacted = redactSensitiveText(stdout);
	const normalized = stdout.replace(/\r/g, "");
	const lines = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
	if (lines.length === 1 && !lines[0]) return undefined;
	const state: ProjectionState = {
		contentComplete: true,
		redactedFieldCount: 0,
		truncatedStringCount: 0,
		omittedObjectKeyCount: 0,
		omittedArrayItemCount: 0,
	};
	const groups: Array<{ count: number; content: unknown }> = [];
	let previous: string | undefined;
	for (const line of lines) {
		if (line === previous) {
			groups[groups.length - 1].count += 1;
			continue;
		}
		previous = line;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			parsed = line;
		}
		groups.push({ count: 1, content: projectValue(parsed, "", 1, state) });
	}
	const output = {
		schema_version: "environment-summary/v1",
		domain: "kubernetes-pod-logs",
		order: "source",
		source_complete: true,
		content_complete: state.contentComplete,
		source_line_count: lines.length,
		group_count: groups.length,
		redacted_field_count: state.redactedFieldCount,
		truncated_string_count: state.truncatedStringCount,
		omitted_object_key_count: state.omittedObjectKeyCount,
		omitted_array_item_count: state.omittedArrayItemCount,
		groups,
	};
	const text = JSON.stringify(output);
	if (Buffer.byteLength(text, "utf8") >= Buffer.byteLength(redacted, "utf8")) return undefined;
	return { text, processor: "kubernetes-pod-logs" };
}
