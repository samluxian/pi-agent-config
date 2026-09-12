import { Buffer } from "node:buffer";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { classifyCommand, fullOutputPath, fullOutputPathFromNativeError } from "./policy.ts";
import { runProcessor } from "./processors.ts";
import type { PipelineContext, PipelineEvent, PipelinePatch, ProcessorRunner } from "./types.ts";

const MIN_DIRECT_PROCESSOR_BYTES = 8 * 1024;
const SUPPORTED_SHELL_TOOLS = new Set(["bash", "safe_bash"]);

function textBytes(content: (TextContent | ImageContent)[]): number {
	return content.reduce((total, block) => total + (block.type === "text" ? Buffer.byteLength(block.text, "utf8") : 0), 0);
}

function textContent(content: (TextContent | ImageContent)[]): string {
	return content.filter((block): block is TextContent => block.type === "text").map((block) => block.text).join("\n");
}

function reportsTruncation(details: unknown): boolean {
	if (!details || typeof details !== "object" || Array.isArray(details)) return false;
	const truncation = (details as Record<string, unknown>).truncation;
	return Boolean(truncation && typeof truncation === "object" && !Array.isArray(truncation) && (truncation as Record<string, unknown>).truncated === true);
}

function replacementContent(content: (TextContent | ImageContent)[], text: string): (TextContent | ImageContent)[] {
	const replacement: TextContent = { type: "text", text };
	const result: (TextContent | ImageContent)[] = [];
	let inserted = false;
	for (const block of content) {
		if (block.type !== "text") result.push(block);
		else if (!inserted) {
			result.push(replacement);
			inserted = true;
		}
	}
	return inserted ? result : content;
}

function processorRequest(event: PipelineEvent, signal?: AbortSignal) {
	if (!SUPPORTED_SHELL_TOOLS.has(event.toolName)) return undefined;
	const kind = classifyCommand(event.input.command);
	const originalText = textContent(event.content);
	if (!kind || !originalText || (event.isError && kind !== "test-result")) return undefined;

	const inputPath = fullOutputPath(event.details)
		?? (event.isError ? fullOutputPathFromNativeError(originalText) : undefined);
	const truncated = reportsTruncation(event.details);
	if (!inputPath && (truncated || Buffer.byteLength(originalText, "utf8") < MIN_DIRECT_PROCESSOR_BYTES)) return undefined;
	return {
		kind,
		input: inputPath ? { type: "file" as const, path: inputPath } : { type: "text" as const, text: originalText },
		inputComplete: Boolean(inputPath) || !truncated,
		commandFailed: event.isError,
		signal,
		inputPath,
	};
}

function summaryText(kind: string, output: string, inputPath?: string): string {
	const labels: Record<string, string> = {
		"terraform-plan": "Terraform plan",
		"helm-manifest": "Helm manifest",
		"test-result": "test result",
	};
	const source = inputPath
		? `[Original output remains available at: ${inputPath}]`
		: "[Original tool result remains in the session transcript; use emitted test identifiers for a focused rerun.]";
	return [
		`[Context Pipeline: deterministic ${labels[kind]} summary from complete bash output]`,
		output.trimEnd(),
		source,
	].join("\n\n");
}

export async function processToolResult(
	event: PipelineEvent,
	ctx: PipelineContext,
	runner: ProcessorRunner = runProcessor,
): Promise<PipelinePatch | undefined> {
	const request = processorRequest(event, ctx.signal);
	if (!request) return undefined;
	try {
		const output = await runner(request);
		if (!output?.complete || output.kind !== request.kind) return undefined;
		const summary = summaryText(request.kind, output.text, request.inputPath);
		return Buffer.byteLength(summary, "utf8") < textBytes(event.content)
			? { content: replacementContent(event.content, summary) }
			: undefined;
	} catch {
		return undefined;
	}
}
