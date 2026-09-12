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
		if (block.type === "text") {
			if (!inserted) {
				result.push(replacement);
				inserted = true;
			}
			continue;
		}
		result.push(block);
	}
	return inserted ? result : content;
}

export async function processToolResult(
	event: PipelineEvent,
	ctx: PipelineContext,
	runner: ProcessorRunner = runProcessor,
): Promise<PipelinePatch | undefined> {
	if (!SUPPORTED_SHELL_TOOLS.has(event.toolName)) return undefined;
	const kind = classifyCommand(event.input.command);
	if (!kind || (event.isError && kind !== "test-result")) return undefined;
	const originalText = textContent(event.content);
	if (!originalText) return undefined;

	const detailPath = fullOutputPath(event.details);
	const errorPath = event.isError ? fullOutputPathFromNativeError(originalText) : undefined;
	const inputPath = detailPath ?? errorPath;
	if (!inputPath && reportsTruncation(event.details)) return undefined;
	if (!inputPath && Buffer.byteLength(originalText, "utf8") < MIN_DIRECT_PROCESSOR_BYTES) return undefined;

	try {
		const output = await runner({
			kind,
			input: inputPath ? { type: "file", path: inputPath } : { type: "text", text: originalText },
			inputComplete: Boolean(inputPath) || !reportsTruncation(event.details),
			commandFailed: event.isError,
			signal: ctx.signal,
		});
		if (!output?.complete || output.kind !== kind) return undefined;
		const label = kind === "terraform-plan" ? "Terraform plan" : kind === "helm-manifest" ? "Helm manifest" : "test result";
		const source = inputPath
			? `[Original output remains available at: ${inputPath}]`
			: "[Original tool result remains in the session transcript; use emitted test identifiers for a focused rerun.]";
		const summary = [
			`[Context Pipeline: deterministic ${label} summary from complete bash output]`,
			output.text.trimEnd(),
			source,
		].join("\n\n");
		if (Buffer.byteLength(summary, "utf8") >= textBytes(event.content)) return undefined;
		return { content: replacementContent(event.content, summary) };
	} catch {
		return undefined;
	}
}
