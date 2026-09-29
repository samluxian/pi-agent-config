import { Buffer } from "node:buffer";
import { boundTextEvidence } from "../text-budget.ts";

const MAX_ENVIRONMENT_OUTPUT_LINES = 120;
const MAX_ENVIRONMENT_OUTPUT_BYTES = 24 * 1024;
const MAX_ENVIRONMENT_ERROR_BYTES = 8 * 1024;
const MAX_ENVIRONMENT_ERROR_LINES = 120;

const MAX_STRUCTURED_PAYLOAD_LINES = MAX_ENVIRONMENT_OUTPUT_LINES - 2;
const MAX_STRUCTURED_PAYLOAD_BYTES = MAX_ENVIRONMENT_OUTPUT_BYTES - 1024;
const ARRAY_PRUNE_ORDER = ["resource_index", "resources", "items", "groups", "findings"];

export interface BoundedEnvironmentOutput {
	text: string;
	truncated: boolean;
	contentComplete: boolean;
}

function withinBudget(
	text: string,
	maxBytes = MAX_ENVIRONMENT_OUTPUT_BYTES,
	maxLines = MAX_ENVIRONMENT_OUTPUT_LINES,
): boolean {
	return text.split("\n").length <= maxLines && Buffer.byteLength(text, "utf8") <= maxBytes;
}

export function boundEnvironmentError(text: string): BoundedEnvironmentOutput {
	const bounded = boundTextEvidence(text, {
		maxLines: MAX_ENVIRONMENT_ERROR_LINES,
		maxBytes: MAX_ENVIRONMENT_ERROR_BYTES,
		label: "inspection diagnostic",
	});
	return { text: bounded.text, truncated: bounded.truncated, contentComplete: bounded.contentComplete };
}

export function boundEnvironmentText(text: string): BoundedEnvironmentOutput {
	const bounded = boundTextEvidence(text, {
		maxLines: MAX_ENVIRONMENT_OUTPUT_LINES,
		maxBytes: MAX_ENVIRONMENT_OUTPUT_BYTES,
		label: "inspection output",
	});
	return { text: bounded.text, truncated: bounded.truncated, contentComplete: bounded.contentComplete };
}

function compactStructuredFallback(value: Record<string, unknown>, originalCounts: Record<string, number>): string {
	const preserved = Object.fromEntries(Object.entries(value).filter(([key, entry]) =>
		!Array.isArray(entry) && key !== "output_budget",
	));
	return JSON.stringify({
		...preserved,
		complete: false,
		content_complete: false,
		output_budget: {
			truncated: true,
			max_lines: MAX_ENVIRONMENT_OUTPUT_LINES,
			max_bytes: MAX_STRUCTURED_PAYLOAD_BYTES,
			original_array_counts: originalCounts,
			all_array_entries_omitted: true,
		},
	}, null, 2);
}

export function boundEnvironmentStructured(text: string): BoundedEnvironmentOutput | undefined {
	let parsed: Record<string, unknown>;
	try {
		const value = JSON.parse(text) as unknown;
		if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
		parsed = value as Record<string, unknown>;
	} catch {
		return undefined;
	}
	const sourceComplete = parsed.source_complete !== false
		&& parsed.complete !== false
		&& parsed.content_complete !== false;
	if (withinBudget(text, MAX_STRUCTURED_PAYLOAD_BYTES, MAX_STRUCTURED_PAYLOAD_LINES)) {
		return { text, truncated: false, contentComplete: sourceComplete };
	}

	const originalCounts: Record<string, number> = {};
	const omittedCounts: Record<string, number> = {};
	for (const key of ARRAY_PRUNE_ORDER) {
		if (Array.isArray(parsed[key])) originalCounts[key] = parsed[key].length;
	}
	parsed.complete = false;
	parsed.content_complete = false;
	parsed.output_budget = {
		truncated: true,
		max_lines: MAX_ENVIRONMENT_OUTPUT_LINES,
		max_bytes: MAX_STRUCTURED_PAYLOAD_BYTES,
		omitted_array_entries: omittedCounts,
	};

	let output = JSON.stringify(parsed, null, 2);
	while (!withinBudget(output, MAX_STRUCTURED_PAYLOAD_BYTES, MAX_STRUCTURED_PAYLOAD_LINES)) {
		const key = ARRAY_PRUNE_ORDER.find((candidate) => Array.isArray(parsed[candidate]) && parsed[candidate].length > 0);
		if (!key) {
			output = compactStructuredFallback(parsed, originalCounts);
			break;
		}
		(parsed[key] as unknown[]).pop();
		omittedCounts[key] = (omittedCounts[key] ?? 0) + 1;
		output = JSON.stringify(parsed, null, 2);
	}
	if (!withinBudget(output, MAX_STRUCTURED_PAYLOAD_BYTES, MAX_STRUCTURED_PAYLOAD_LINES)) return undefined;
	return { text: output, truncated: true, contentComplete: false };
}
