import { summarizeGcloudLogging } from "./environment/gcloud-logging.ts";
import { summarizeKubernetesProjection } from "./environment/kubernetes.ts";
import { summarizePodLogs } from "./environment/pod-logs.ts";
import type { EnvironmentProcessorInput, EnvironmentProcessorResult } from "./types.ts";

export function processEnvironmentOutput(input: EnvironmentProcessorInput): EnvironmentProcessorResult | undefined {
	try {
		if (input.command === "kubectl" && ["pods", "workloads", "services", "events"].includes(input.operation)) {
			return summarizeKubernetesProjection(input.operation, input.stdout);
		}
		if (input.command === "kubectl" && input.operation === "pod_logs") return summarizePodLogs(input.stdout);
		if (input.command === "gcloud" && input.operation === "logging") return summarizeGcloudLogging(input.stdout, input.request);
		return undefined;
	} catch {
		return undefined;
	}
}
