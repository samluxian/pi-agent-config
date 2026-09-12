import { Buffer } from "node:buffer";
import { boundedRedactedText, redactSensitiveText } from "./redaction.ts";

const MAX_FAILURE_GROUPS = 25;
const MAX_FAILURE_DETAIL_CHARS = 2_048;
const MAX_TEST_SUMMARY_BYTES = 16 * 1024;
const ABNORMAL_TERMINATION_PATTERNS = [
	/\bcommand not found\b/i,
	/^\s*(?:Command )?timed out\b/i,
	/^\s*Command (?:was )?(?:terminated|killed)\b/i,
	/^\s*(?:npm ERR!|npm error) code (?:126|127)\b/i,
	/^\s*(?:Error:\s*)?(?:test\s+)?runner (?:crashed|terminated)\b/i,
	/^\s*(?:Killed|Segmentation fault)(?::|\s|$)/i,
];

type Runner = "tap" | "pytest" | "unittest";

interface FailureGroup {
	id: string;
	occurrences: number;
	detail: string;
	detail_truncated: boolean;
}

interface Counts {
	tests?: number;
	suites?: number;
	passed?: number;
	failed?: number;
	cancelled?: number;
	skipped?: number;
	todo?: number;
	warnings?: number;
}

export interface TestResultProjection {
	text: string;
	complete: boolean;
}

function normalizedLines(text: string): string[] {
	return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function detectRunner(lines: string[]): Runner | undefined {
	if (lines.some((line) => /^\s*TAP version \d+\s*$/.test(line)) || lines.some((line) => /^\s*# (?:tests|pass|fail) \d+\s*$/.test(line))) return "tap";
	if (lines.some((line) => /^=+ (?:short test summary info|test session starts|failures|errors) =+$/i.test(line)) || lines.some((line) => /\b\d+ (?:failed|passed|error|errors)(?:,| in )/i.test(line))) return "pytest";
	if (lines.some((line) => /^(?:FAIL|ERROR): \S+/.test(line)) || lines.some((line) => /^Ran \d+ tests? in /.test(line))) return "unittest";
	return undefined;
}

function parseCount(value: string): number {
	return Number.parseInt(value, 10);
}

function parseTapCounts(lines: string[]): Counts {
	const counts: Counts = {};
	const fields: Record<string, keyof Counts> = {
		tests: "tests",
		suites: "suites",
		pass: "passed",
		fail: "failed",
		cancelled: "cancelled",
		skipped: "skipped",
		todo: "todo",
	};
	for (const line of lines) {
		const match = line.match(/^\s*# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$/);
		if (match) counts[fields[match[1]]] = parseCount(match[2]);
	}
	return counts;
}

const UNITTEST_COUNT_FIELDS: Record<string, keyof Counts> = {
	failures: "failed",
	errors: "failed",
	skipped: "skipped",
};

const PYTEST_COUNT_FIELDS: Record<string, keyof Counts> = {
	failed: "failed",
	error: "failed",
	errors: "failed",
	passed: "passed",
	skipped: "skipped",
	warning: "warnings",
	warnings: "warnings",
};

function incrementCount(counts: Counts, field: keyof Counts, value: number): void {
	counts[field] = (counts[field] ?? 0) + value;
}

function parseUnittestCounts(lines: string[]): Counts {
	const counts: Counts = {};
	for (const line of lines) {
		const ran = line.match(/^Ran (\d+) tests? in /);
		if (ran) counts.tests = parseCount(ran[1]);
		const failed = line.match(/^FAILED \((.+)\)$/);
		if (!failed) continue;
		for (const part of failed[1].split(",")) {
			const value = part.trim().match(/^(failures|errors|skipped)=(\d+)$/);
			if (value) incrementCount(counts, UNITTEST_COUNT_FIELDS[value[1]], parseCount(value[2]));
		}
	}
	if (counts.tests !== undefined && counts.failed !== undefined) {
		counts.passed = Math.max(0, counts.tests - counts.failed - (counts.skipped ?? 0));
	}
	return counts;
}

function parsePytestCounts(lines: string[]): Counts {
	const counts: Counts = {};
	const summary = [...lines].reverse().find((line) => /\b\d+ (?:failed|passed|error|errors|skipped|warning|warnings)(?:,| in )/i.test(line));
	if (!summary) return counts;
	for (const match of summary.matchAll(/(\d+) (failed|passed|error|errors|skipped|warning|warnings)/gi)) {
		incrementCount(counts, PYTEST_COUNT_FIELDS[match[2].toLowerCase()], parseCount(match[1]));
	}
	counts.tests = (counts.passed ?? 0) + (counts.failed ?? 0) + (counts.skipped ?? 0);
	return counts;
}

function parsePythonCounts(lines: string[], runner: Runner): Counts {
	return runner === "unittest" ? parseUnittestCounts(lines) : parsePytestCounts(lines);
}

function capturePytestBlocks(lines: string[]): Array<{ id: string; detail: string }> {
	const section = /^_{3,}\s*(.+?)\s*_{3,}$/;
	const collection = /^_{3,}\s*ERROR collecting (.+?)\s*_{3,}$/;
	const stop = /^_{3,}\s*.+?\s*_{3,}$|^=+ (?:short test summary info|warnings summary) =+$/i;
	const blocks: Array<{ id: string; detail: string }> = [];
	for (let index = 0; index < lines.length; index++) {
		const start = lines[index].match(collection) ?? lines[index].match(section);
		if (!start || /^(?:FAILURES|ERRORS)$/i.test(start[1].trim())) continue;
		const detail = [lines[index]];
		for (let cursor = index + 1; cursor < lines.length && !stop.test(lines[cursor]); cursor++) detail.push(lines[cursor]);
		blocks.push({ id: boundedRedactedText(start[1].trim(), 500), detail: detail.join("\n").trim() });
	}
	if (blocks.length > 0) return blocks;
	for (const line of lines) {
		const summary = line.match(/^(?:FAILED|ERROR)\s+([^\s]+)(?:\s+-\s+.*)?$/);
		if (summary) blocks.push({ id: boundedRedactedText(summary[1], 500), detail: line });
	}
	return blocks;
}

function captureBlocks(lines: string[], runner: Runner): Array<{ id: string; detail: string }> {
	if (runner === "pytest") return capturePytestBlocks(lines);
	const starts = runner === "tap" ? /^\s*not ok \d+ - (.+)$/ : /^(?:FAIL|ERROR): (.+)$/;
	const stops = runner === "tap" ? /^\s*(?:not )?ok \d+ - / : /^(?:(?:FAIL|ERROR): |Ran \d+ tests? in )/;
	const blocks: Array<{ id: string; detail: string }> = [];
	for (let index = 0; index < lines.length; index++) {
		const start = lines[index].match(starts);
		if (!start) continue;
		const detail = [lines[index]];
		for (let cursor = index + 1; cursor < lines.length && !stops.test(lines[cursor]); cursor++) detail.push(lines[cursor]);
		blocks.push({ id: boundedRedactedText(start[1].trim(), 500), detail: detail.join("\n").trim() });
	}
	return blocks;
}

function groupFailures(blocks: Array<{ id: string; detail: string }>): { groups: FailureGroup[]; detailTruncated: boolean } {
	const grouped = new Map<string, FailureGroup>();
	let detailTruncated = false;
	for (const block of blocks) {
		const redacted = redactSensitiveText(block.detail);
		const signatureLine = redacted.split("\n").find((line) => /(?:AssertionError|Error:|error:|code:|failureType:)/i.test(line))?.trim() ?? block.id;
		const signature = `${block.id}\u0000${signatureLine}`;
		const existing = grouped.get(signature);
		if (existing) {
			existing.occurrences += 1;
			continue;
		}
		const detail = boundedRedactedText(redacted, MAX_FAILURE_DETAIL_CHARS);
		const truncated = detail.length < redacted.replaceAll("\u0000", "�").length;
		detailTruncated ||= truncated;
		grouped.set(signature, { id: block.id, occurrences: 1, detail, detail_truncated: truncated });
	}
	return { groups: [...grouped.values()], detailTruncated };
}

function hasCountEvidence(counts: Counts): boolean {
	return Object.values(counts).some((value) => typeof value === "number");
}

function reportsAbnormalTermination(lines: string[]): boolean {
	return lines.some((line) => ABNORMAL_TERMINATION_PATTERNS.some((pattern) => pattern.test(line)));
}

function serializeBounded(summary: Record<string, unknown>, groups: FailureGroup[]): string | undefined {
	let emitted = groups.slice(0, MAX_FAILURE_GROUPS);
	const cappedByCount = groups.length > emitted.length;
	while (true) {
		const contentComplete = !cappedByCount && emitted.length === groups.length && !summary.failure_detail_truncated;
		const candidate = {
			...summary,
			content_complete: contentComplete,
			failure_groups_total: groups.length,
			failure_groups_emitted: emitted.length,
			failure_groups_omitted: groups.length - emitted.length,
			failures: emitted,
		};
		const text = JSON.stringify(candidate, null, 2);
		if (Buffer.byteLength(text, "utf8") <= MAX_TEST_SUMMARY_BYTES) return text;
		if (!emitted.length) return undefined;
		emitted = emitted.slice(0, -1);
	}
}

export function summarizeTestResult(text: string, inputComplete: boolean, commandFailed: boolean): TestResultProjection | undefined {
	const lines = normalizedLines(text);
	const runner = detectRunner(lines);
	if (!runner) return undefined;
	const counts = runner === "tap" ? parseTapCounts(lines) : parsePythonCounts(lines, runner);
	if (!hasCountEvidence(counts)) return undefined;
	const captured = captureBlocks(lines, runner);
	const { groups, detailTruncated } = groupFailures(captured);
	const failed = counts.failed ?? groups.reduce((total, group) => total + group.occurrences, 0);
	if (reportsAbnormalTermination(lines) || (commandFailed && failed === 0 && groups.length === 0)) return undefined;
	const result = failed > 0 ? "fail" : "pass";
	const summary: Record<string, unknown> = {
		schema_version: "test-result-summary/v1",
		type: "test_result_summary",
		runner,
		result,
		input_complete: inputComplete,
		source_line_count: lines.length,
		counts: { ...counts, failed },
		failure_detail_truncated: detailTruncated,
		redaction_applied: true,
	};
	if (result === "fail" && groups.length === 0) summary.diagnostic = "Runner reported failure without a recognized failure block; inspect the original result.";
	const output = serializeBounded(summary, groups);
	return output ? { text: output, complete: inputComplete } : undefined;
}
