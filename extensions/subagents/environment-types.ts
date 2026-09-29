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

