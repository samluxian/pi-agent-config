import { Buffer } from "node:buffer";

export const SUBAGENT_RESULT_BUDGET = Object.freeze({ maxLines: 400, maxBytes: 16 * 1024 });
export const SUBAGENT_TOOL_OUTPUT_BUDGET = Object.freeze({ maxLines: 600, maxBytes: 24 * 1024 });

export interface TextBudget {
	maxLines: number;
	maxBytes: number;
	headRatio?: number;
	label?: string;
}

export interface BoundedText {
	text: string;
	truncated: boolean;
	contentComplete: boolean;
	sourceLines: number;
	sourceBytes: number;
	emittedLines: number;
	emittedBytes: number;
}

function utf8Prefix(data: Buffer, maxBytes: number): string {
	let end = Math.min(data.length, Math.max(0, maxBytes));
	while (end > 0 && end < data.length && (data[end] & 0xc0) === 0x80) end -= 1;
	return data.subarray(0, end).toString("utf8");
}

function utf8Suffix(data: Buffer, maxBytes: number): string {
	let start = Math.max(0, data.length - Math.max(0, maxBytes));
	while (start < data.length && (data[start] & 0xc0) === 0x80) start += 1;
	return data.subarray(start).toString("utf8");
}

function result(text: string, truncated: boolean, sourceLines: number, sourceBytes: number): BoundedText {
	return {
		text,
		truncated,
		contentComplete: !truncated,
		sourceLines,
		sourceBytes,
		emittedLines: text.split("\n").length,
		emittedBytes: Buffer.byteLength(text, "utf8"),
	};
}

export function boundTextEvidence(text: string, budget: TextBudget): BoundedText {
	const sourceLines = text.split("\n").length;
	const sourceBytes = Buffer.byteLength(text, "utf8");
	const maxLines = Math.max(1, Math.floor(budget.maxLines));
	const maxBytes = Math.max(0, Math.floor(budget.maxBytes));
	if (sourceLines <= maxLines && sourceBytes <= maxBytes) return result(text, false, sourceLines, sourceBytes);

	const ratio = Math.min(0.9, Math.max(0.1, budget.headRatio ?? 2 / 3));
	const label = budget.label ?? "output";
	const marker = `[... ${label} omitted; source_lines=${sourceLines} source_bytes=${sourceBytes} content_complete=false ...]`;
	const markerBuffer = Buffer.from(marker, "utf8");
	if (maxLines < 3 || markerBuffer.length > maxBytes) {
		return result(utf8Prefix(markerBuffer, maxBytes), true, sourceLines, sourceBytes);
	}

	const lines = text.split("\n");
	const availableLines = maxLines - 1;
	let headSource: string;
	let tailSource: string;
	if (sourceLines <= maxLines - 2) {
		headSource = text;
		tailSource = text;
	} else {
		const headLines = Math.max(1, Math.floor(availableLines * ratio));
		const tailLines = Math.max(1, availableLines - headLines);
		headSource = lines.slice(0, headLines).join("\n");
		tailSource = lines.slice(-tailLines).join("\n");
	}

	const markerText = `\n${marker}\n`;
	const markerBytes = Buffer.byteLength(markerText, "utf8");
	if (markerBytes > maxBytes) {
		return result(utf8Prefix(markerBuffer, maxBytes), true, sourceLines, sourceBytes);
	}
	const fullProjection = `${headSource}${markerText}${tailSource}`;
	if (Buffer.byteLength(fullProjection, "utf8") <= maxBytes) {
		return result(fullProjection, true, sourceLines, sourceBytes);
	}
	const availableBytes = maxBytes - markerBytes;
	const headBytes = Math.floor(availableBytes * ratio);
	const output = `${utf8Prefix(Buffer.from(headSource, "utf8"), headBytes)}${markerText}${utf8Suffix(Buffer.from(tailSource, "utf8"), availableBytes - headBytes)}`;
	return result(output, true, sourceLines, sourceBytes);
}
