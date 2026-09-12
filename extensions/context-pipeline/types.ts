import type { TextContent, ImageContent } from "@earendil-works/pi-ai";

export type SupportedProcessor = "terraform-plan" | "helm-manifest" | "test-result";

export interface PipelineContext {
	signal?: AbortSignal;
}

export type ProcessorInput =
	| { type: "file"; path: string }
	| { type: "text"; text: string };

export interface ProcessorRequest {
	kind: SupportedProcessor;
	input: ProcessorInput;
	inputComplete: boolean;
	commandFailed: boolean;
	signal?: AbortSignal;
}

export interface ProcessorOutput {
	kind: SupportedProcessor;
	text: string;
	complete: boolean;
}

export interface PipelineEvent {
	toolName: string;
	input: Record<string, unknown>;
	content: (TextContent | ImageContent)[];
	details?: unknown;
	isError: boolean;
}

export interface PipelinePatch {
	content: (TextContent | ImageContent)[];
}

export interface EnvironmentProcessorInput {
	command: "kubectl" | "gcloud";
	operation: string;
	label: string;
	stdout: string;
	request: Record<string, unknown>;
}

export interface EnvironmentProcessorResult {
	text: string;
	processor: string;
}

export type ProcessorRunner = (request: ProcessorRequest) => Promise<ProcessorOutput | undefined>;
