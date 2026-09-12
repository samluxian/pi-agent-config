import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { processEnvironmentOutput } from "../../context-pipeline/environment-processors.ts";
import { boundEnvironmentError, boundEnvironmentStructured, boundEnvironmentText } from "../../context-pipeline/environment/output-budget.ts";
import { redactSensitiveText } from "../../context-pipeline/redaction.ts";

export { boundEnvironmentText as boundOutput } from "../../context-pipeline/environment/output-budget.ts";
export { redactSensitiveText } from "../../context-pipeline/redaction.ts";

const COMMAND_TIMEOUT_MS = 30_000;
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const POD_COLUMNS = "custom-columns=APIVERSION:.apiVersion,KIND:.kind,NAMESPACE:.metadata.namespace,NAME:.metadata.name,CREATED_AT:.metadata.creationTimestamp,PHASE:.status.phase,NODE:.spec.nodeName,SERVICE_ACCOUNT:.spec.serviceAccountName,READY:.status.containerStatuses[*].ready,RESTARTS:.status.containerStatuses[*].restartCount,WAITING:.status.containerStatuses[*].state.waiting.reason,TERMINATED:.status.containerStatuses[*].state.terminated.reason";
const WORKLOAD_COLUMNS = "custom-columns=APIVERSION:.apiVersion,KIND:.kind,NAMESPACE:.metadata.namespace,NAME:.metadata.name,CREATED_AT:.metadata.creationTimestamp,DESIRED:.spec.replicas,CURRENT:.status.replicas,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,UPDATED:.status.updatedReplicas,UNAVAILABLE:.status.unavailableReplicas,DAEMON_DESIRED:.status.desiredNumberScheduled,DAEMON_CURRENT:.status.currentNumberScheduled,DAEMON_READY:.status.numberReady,DAEMON_AVAILABLE:.status.numberAvailable,DAEMON_UPDATED:.status.updatedNumberScheduled,DAEMON_UNAVAILABLE:.status.numberUnavailable";
const SERVICE_COLUMNS = "custom-columns=APIVERSION:.apiVersion,KIND:.kind,NAMESPACE:.metadata.namespace,NAME:.metadata.name,TYPE:.spec.type,CLUSTER_IP:.spec.clusterIP,SERVICE:.metadata.labels.kubernetes\\.io/service-name,ADDRESS_TYPE:.addressType,SERVICE_PORTS:.spec.ports[*].port,TARGET_PORTS:.spec.ports[*].targetPort,ENDPOINT_READY:.endpoints[*].conditions.ready,ENDPOINT_PORTS:.ports[*].port";
const EVENT_COLUMNS = "custom-columns=APIVERSION:.apiVersion,KIND:.kind,NAMESPACE:.metadata.namespace,NAME:.metadata.name,TYPE:.type,REASON:.reason,COUNT:.count,REGARDING_KIND:.involvedObject.kind,REGARDING_NAME:.involvedObject.name,FIRST_TIMESTAMP:.firstTimestamp,LAST_TIMESTAMP:.lastTimestamp,EVENT_TIME:.eventTime";

interface CommandSpec {
	label: string;
	command: "kubectl" | "gcloud";
	args: string[];
}

type KubectlOperation =
	| "current_context"
	| "namespaces"
	| "nodes"
	| "workloads"
	| "pods"
	| "services"
	| "ingresses"
	| "events"
	| "storage"
	| "pod_logs"
	| "auth_can_i";

type GcloudOperation =
	| "active_context"
	| "gke_clusters"
	| "gke_cluster"
	| "compute_disks"
	| "compute_disk"
	| "project_quotas"
	| "service_accounts"
	| "asset_inventory"
	| "activity_history"
	| "logging";

function requireName(value: unknown, field: string): string {
	if (typeof value !== "string" || !NAME_PATTERN.test(value)) {
		throw new Error(`${field} must be an explicit name containing only letters, digits, dot, underscore, or hyphen.`);
	}
	return value;
}

function requireProject(value: unknown): string {
	if (typeof value !== "string" || !PROJECT_PATTERN.test(value)) {
		throw new Error("project must be an explicit GCP project ID.");
	}
	return value;
}

function optionalSelector(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.length < 1 || value.length > 300 || /[\r\n]/.test(value)) {
		throw new Error("selector must be a bounded single-line Kubernetes label selector.");
	}
	return value;
}

function optionalBoundedText(value: unknown, field: string, maxLength = 500): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.length < 1 || value.length > maxLength || /[\r\n]/.test(value)) {
		throw new Error(`${field} must be a bounded single-line value.`);
	}
	return value;
}

function optionalAssetTypes(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
		throw new Error("assetTypes must contain 1 to 20 explicit Cloud Asset Inventory type patterns.");
	}
	const types = value.map((entry) => String(entry));
	if (types.some((entry) => !/^[a-zA-Z0-9.*_/-]{1,200}$/.test(entry))) {
		throw new Error("assetTypes contains an unsupported type pattern.");
	}
	return types;
}

function kubectlBase(context: unknown): string[] {
	return context === undefined ? [] : ["--context", requireName(context, "context")];
}

function namespacedGet(
	context: unknown,
	namespace: unknown,
	resource: string,
	selector: unknown,
	output = "wide",
): string[] {
	const args = [...kubectlBase(context), "get", resource, "--namespace", requireName(namespace, "namespace"), "-o", output];
	if (output.startsWith("custom-columns=")) args.push("--no-headers");
	const selected = optionalSelector(selector);
	if (selected) args.push("--selector", selected);
	return args;
}

type KubectlBuilder = (input: Record<string, unknown>, base: string[]) => CommandSpec[];
type GcloudBuilder = (input: Record<string, unknown>, project: string) => CommandSpec[];

function kubectlCommand(label: string, args: string[]): CommandSpec[] {
	return [{ label, command: "kubectl", args }];
}

function gcloudCommand(label: string, args: string[]): CommandSpec[] {
	return [{ label, command: "gcloud", args }];
}

function boundedInteger(value: unknown, defaultValue: number, maximum: number, error: string): number {
	const number = value === undefined ? defaultValue : Number(value);
	if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error(error);
	return number;
}

function allowedValue(value: unknown, defaultValue: string, allowed: string[], error: string): string {
	const selected = value === undefined ? defaultValue : String(value);
	if (!allowed.includes(selected)) throw new Error(error);
	return selected;
}

function requireLoggingFilter(value: unknown): string {
	const filter = typeof value === "string" ? value : "";
	if (!/^(?![\s\S]*[\r\n])[\s\S]{1,500}$/.test(filter)) throw new Error("filter must be an explicit bounded single-line Cloud Logging filter.");
	return filter;
}

function appendOptionalName(args: string[], value: unknown, flag: string, field: string): void {
	if (value !== undefined) args.push(flag, requireName(value, field));
}

function buildStorageCommands(input: Record<string, unknown>, base: string[]): CommandSpec[] {
	const commands: CommandSpec[] = [
		{ label: "storage classes", command: "kubectl", args: [...base, "get", "storageclasses", "-o", "wide"] },
		{ label: "persistent volumes", command: "kubectl", args: [...base, "get", "persistentvolumes", "-o", "wide"] },
		{ label: "CSI drivers", command: "kubectl", args: [...base, "get", "csidrivers", "-o", "wide"] },
		{ label: "volume attachments", command: "kubectl", args: [...base, "get", "volumeattachments", "-o", "wide"] },
	];
	if (input.namespace !== undefined) {
		commands.push({ label: "persistent volume claims", command: "kubectl", args: namespacedGet(input.context, input.namespace, "persistentvolumeclaims", input.selector) });
	}
	return commands;
}

function buildPodLogCommands(input: Record<string, unknown>, base: string[]): CommandSpec[] {
	const tail = boundedInteger(input.tail, 100, 200, "tail must be an integer from 1 to 200.");
	const since = allowedValue(input.since, "15m", ["5m", "15m", "30m", "1h"], "since must be 5m, 15m, 30m, or 1h.");
	const args = [...base, "logs", requireName(input.pod, "pod"), "--namespace", requireName(input.namespace, "namespace"), `--tail=${tail}`, `--since=${since}`];
	appendOptionalName(args, input.container, "--container", "container");
	return kubectlCommand("pod logs", args);
}

const kubectlOperationBuilders: Record<KubectlOperation, KubectlBuilder> = {
	current_context: () => kubectlCommand("current context", ["config", "current-context"]),
	namespaces: (_input, base) => kubectlCommand("namespaces", [...base, "get", "namespaces", "-o", "wide"]),
	nodes: (_input, base) => kubectlCommand("nodes", [...base, "get", "nodes", "-o", "wide"]),
	workloads: (input) => kubectlCommand("workloads", namespacedGet(input.context, input.namespace, "deployments,statefulsets,daemonsets", input.selector, WORKLOAD_COLUMNS)),
	pods: (input) => kubectlCommand("pods", namespacedGet(input.context, input.namespace, "pods", input.selector, POD_COLUMNS)),
	services: (input) => kubectlCommand("services", namespacedGet(input.context, input.namespace, "services,endpointslices", input.selector, SERVICE_COLUMNS)),
	ingresses: (input) => kubectlCommand("ingresses", namespacedGet(input.context, input.namespace, "ingresses", input.selector)),
	events: (input, base) => kubectlCommand("events", [...base, "get", "events", "--namespace", requireName(input.namespace, "namespace"), "--sort-by=.lastTimestamp", "-o", EVENT_COLUMNS, "--no-headers"]),
	storage: buildStorageCommands,
	pod_logs: buildPodLogCommands,
	auth_can_i: (input, base) => kubectlCommand("authorization check", [...base, "auth", "can-i", requireName(input.verb, "verb"), requireName(input.resource, "resource"), "--namespace", requireName(input.namespace, "namespace")]),
};

export function buildKubectlCommands(input: Record<string, unknown>): CommandSpec[] {
	const base = kubectlBase(input.context);
	const builder = kubectlOperationBuilders[input.operation as KubectlOperation];
	if (!builder) throw new Error(`Unsupported kubectl_inspect operation: ${String(input.operation)}`);
	return builder(input, base);
}

function buildAssetInventoryCommands(input: Record<string, unknown>, project: string): CommandSpec[] {
	const view = allowedValue(input.view, "summary", ["names", "summary"], "view must be names or summary.");
	const format = view === "names" ? "--format=csv[no-heading](name)" : "--format=csv[no-heading](assetType,name,displayName,location,state,createTime,updateTime,parent,labels)";
	const args = ["asset", "search-all-resources", `--scope=projects/${project}`, "--limit=1000", format];
	const assetTypes = optionalAssetTypes(input.assetTypes);
	if (assetTypes) args.push(`--asset-types=${assetTypes.join(",")}`);
	const query = optionalBoundedText(input.query, "query");
	if (query) args.push(`--query=${query}`);
	return gcloudCommand("Cloud Asset Inventory", args);
}

function buildActivityHistoryCommands(input: Record<string, unknown>, project: string): CommandSpec[] {
	const freshness = allowedValue(input.freshness, "400d", ["1d", "7d", "30d", "90d", "180d", "400d"], "freshness must be 1d, 7d, 30d, 90d, 180d, or 400d.");
	const limit = boundedInteger(input.limit, 100, 200, "limit must be an integer from 1 to 200.");
	const resourceName = optionalBoundedText(input.resourceName, "resourceName", 1000);
	const activityFilter = optionalBoundedText(input.activityFilter, "activityFilter", 500);
	const filters = ['log_id("cloudaudit.googleapis.com/activity")'];
	if (resourceName) filters.push(`protoPayload.resourceName="${resourceName.replaceAll('"', '\\"')}"`);
	if (activityFilter) filters.push(`(${activityFilter})`);
	return gcloudCommand("Admin Activity history", ["logging", "read", filters.join(" AND "), `--project=${project}`, `--freshness=${freshness}`, `--limit=${limit}`, "--order=desc", "--format=json(timestamp,protoPayload.serviceName,protoPayload.methodName,protoPayload.resourceName,protoPayload.authenticationInfo.principalEmail,protoPayload.requestMetadata.callerSuppliedUserAgent,protoPayload.status.message)"]);
}

function buildLoggingCommands(input: Record<string, unknown>, project: string): CommandSpec[] {
	const filter = requireLoggingFilter(input.filter);
	const freshness = allowedValue(input.freshness, "15m", ["5m", "15m", "30m", "1h"], "freshness must be 5m, 15m, 30m, or 1h.");
	const limit = boundedInteger(input.limit, 50, 100, "limit must be an integer from 1 to 100.");
	return gcloudCommand("Cloud Logging", ["logging", "read", filter, `--project=${project}`, `--freshness=${freshness}`, `--limit=${limit}`, "--order=desc", "--format=json(timestamp,severity,resource.type,logName,textPayload,jsonPayload.message)"]);
}

const gcloudOperationBuilders: Record<Exclude<GcloudOperation, "active_context">, GcloudBuilder> = {
	gke_clusters: (_input, project) => gcloudCommand("GKE clusters", ["container", "clusters", "list", `--project=${project}`, "--format=table(name,location,status,currentMasterVersion,currentNodeVersion,autopilot.enabled)"]),
	gke_cluster: (input, project) => gcloudCommand("GKE cluster", ["container", "clusters", "describe", requireName(input.cluster, "cluster"), `--location=${requireName(input.location, "location")}`, `--project=${project}`, "--format=json(name,location,status,currentMasterVersion,currentNodeVersion,autopilot,releaseChannel,network,subnetwork,privateClusterConfig,workloadIdentityConfig,addonsConfig,resourceLabels)"]),
	compute_disks: (_input, project) => gcloudCommand("Compute disks", ["compute", "disks", "list", `--project=${project}`, "--format=table(name,zone.basename(),region.basename(),type.basename(),sizeGb,status,users.len())"]),
	compute_disk: (input, project) => gcloudCommand("Compute disk", ["compute", "disks", "describe", requireName(input.disk, "disk"), `--zone=${requireName(input.zone, "zone")}`, `--project=${project}`, "--format=json(name,zone,region,type,sizeGb,status,users,labels,physicalBlockSizeBytes,provisionedIops,provisionedThroughput,onUpdateAction)"]),
	project_quotas: (_input, project) => gcloudCommand("project quotas", ["compute", "project-info", "describe", `--project=${project}`, "--format=json(quotas)"]),
	service_accounts: (_input, project) => gcloudCommand("service accounts", ["iam", "service-accounts", "list", `--project=${project}`, "--format=table(email,displayName,disabled)"]),
	asset_inventory: buildAssetInventoryCommands,
	activity_history: buildActivityHistoryCommands,
	logging: buildLoggingCommands,
};

export function buildGcloudCommands(input: Record<string, unknown>): CommandSpec[] {
	if (input.operation === "active_context") return gcloudCommand("active gcloud context", ["config", "list", "account,core/project", "--format=json"]);
	const project = requireProject(input.project);
	const builder = gcloudOperationBuilders[input.operation as Exclude<GcloudOperation, "active_context">];
	if (!builder) throw new Error(`Unsupported gcloud_inspect operation: ${String(input.operation)}`);
	return builder(input, project);
}

async function executeCommands(
	pi: ExtensionAPI,
	commands: CommandSpec[],
	input: Record<string, unknown>,
	signal: AbortSignal | undefined,
	onUpdate: ((result: any) => void) | undefined,
) {
	const sections: string[] = [];
	const processors: string[] = [];
	let truncated = false;
	let contentComplete = true;
	for (const spec of commands) {
		onUpdate?.({ content: [{ type: "text", text: `Inspecting ${spec.label}...` }], details: {} });
		const result = await pi.exec(spec.command, spec.args, { signal, timeout: COMMAND_TIMEOUT_MS });
		const rawStdout = result.stdout || "";
		const stderr = redactSensitiveText(result.stderr || "");
		if (result.code !== 0) {
			const diagnostic = stderr || redactSensitiveText(rawStdout) || "no diagnostic output";
			const bounded = boundEnvironmentError(diagnostic);
			throw new Error(`${spec.command} ${spec.label} failed (exit ${result.code}; content_complete=${bounded.contentComplete}): ${bounded.text}`);
		}
		const processed = processEnvironmentOutput({
			command: spec.command,
			operation: String(input.operation || ""),
			label: spec.label,
			stdout: rawStdout,
			request: input,
		});
		if (processed) processors.push(processed.processor);
		const bounded = processed
			? boundEnvironmentStructured(processed.text) ?? boundEnvironmentText(processed.text)
			: boundEnvironmentText(redactSensitiveText(rawStdout));
		truncated ||= bounded.truncated;
		contentComplete &&= bounded.contentComplete;
		sections.push(`## ${spec.label}\n${bounded.text.trim() || "(no output)"}`);
	}
	let output = sections.join("\n\n");
	if (commands.length > 1 || processors.length === 0) {
		const bounded = boundEnvironmentText(output);
		output = bounded.text;
		truncated ||= bounded.truncated;
		contentComplete &&= bounded.contentComplete;
	}
	return {
		content: [{ type: "text" as const, text: output }],
		details: {
			checks: commands.map(({ label, command }) => ({ label, command })),
			processors,
			truncated,
			contentComplete,
		},
	};
}

export default function environmentInspect(pi: ExtensionAPI) {
	pi.registerTool({
		name: "kubectl_inspect",
		label: "Kubectl Inspect",
		description: "Run one structured, read-only Kubernetes inspection. No arbitrary kubectl arguments, secret/config data, exec, port-forward, or mutations.",
		parameters: Type.Object({
			operation: StringEnum(["current_context", "namespaces", "nodes", "workloads", "pods", "services", "ingresses", "events", "storage", "pod_logs", "auth_can_i"] as const),
			context: Type.Optional(Type.String()),
			namespace: Type.Optional(Type.String()),
			selector: Type.Optional(Type.String()),
			pod: Type.Optional(Type.String()),
			container: Type.Optional(Type.String()),
			tail: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
			since: Type.Optional(StringEnum(["5m", "15m", "30m", "1h"] as const)),
			verb: Type.Optional(Type.String()),
			resource: Type.Optional(Type.String()),
		}),
		async execute(_id, params, signal, onUpdate) {
			return executeCommands(pi, buildKubectlCommands(params), params, signal, onUpdate);
		},
	});

	pi.registerTool({
		name: "gcloud_inspect",
		label: "Gcloud Inspect",
		description: "Run one structured, read-only GCP inspection. No arbitrary gcloud arguments, credentials, secrets, SSH, get-credentials, IAM/config changes, or mutations.",
		parameters: Type.Object({
			operation: StringEnum(["active_context", "gke_clusters", "gke_cluster", "compute_disks", "compute_disk", "project_quotas", "service_accounts", "asset_inventory", "activity_history", "logging"] as const),
			project: Type.Optional(Type.String()),
			cluster: Type.Optional(Type.String()),
			location: Type.Optional(Type.String()),
			disk: Type.Optional(Type.String()),
			zone: Type.Optional(Type.String()),
			assetTypes: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: 20 })),
			view: Type.Optional(StringEnum(["names", "summary"] as const)),
			query: Type.Optional(Type.String()),
			resourceName: Type.Optional(Type.String()),
			activityFilter: Type.Optional(Type.String()),
			filter: Type.Optional(Type.String()),
			freshness: Type.Optional(StringEnum(["5m", "15m", "30m", "1h", "1d", "7d", "30d", "90d", "180d", "400d"] as const)),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
		}),
		async execute(_id, params, signal, onUpdate) {
			return executeCommands(pi, buildGcloudCommands(params), params, signal, onUpdate);
		},
	});
}
