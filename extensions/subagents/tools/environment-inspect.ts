import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const MAX_OUTPUT_LINES = 120;
const MAX_OUTPUT_BYTES = 24 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;

interface CommandSpec {
	label: string;
	command: "kubectl" | "gcloud";
	args: string[];
}

export type KubectlOperation =
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

export type GcloudOperation =
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
): string[] {
	const args = [...kubectlBase(context), "get", resource, "--namespace", requireName(namespace, "namespace"), "-o", "wide"];
	const selected = optionalSelector(selector);
	if (selected) args.push("--selector", selected);
	return args;
}

export function buildKubectlCommands(input: Record<string, unknown>): CommandSpec[] {
	const operation = input.operation as KubectlOperation;
	const base = kubectlBase(input.context);
	switch (operation) {
		case "current_context":
			return [{ label: "current context", command: "kubectl", args: ["config", "current-context"] }];
		case "namespaces":
			return [{ label: "namespaces", command: "kubectl", args: [...base, "get", "namespaces", "-o", "wide"] }];
		case "nodes":
			return [{ label: "nodes", command: "kubectl", args: [...base, "get", "nodes", "-o", "wide"] }];
		case "workloads":
			return [{ label: "workloads", command: "kubectl", args: namespacedGet(input.context, input.namespace, "deployments,statefulsets,daemonsets", input.selector) }];
		case "pods":
			return [{ label: "pods", command: "kubectl", args: namespacedGet(input.context, input.namespace, "pods", input.selector) }];
		case "services":
			return [{ label: "services", command: "kubectl", args: namespacedGet(input.context, input.namespace, "services,endpointslices", input.selector) }];
		case "ingresses":
			return [{ label: "ingresses", command: "kubectl", args: namespacedGet(input.context, input.namespace, "ingresses", input.selector) }];
		case "events":
			return [{
				label: "events",
				command: "kubectl",
				args: [...base, "get", "events", "--namespace", requireName(input.namespace, "namespace"), "--sort-by=.lastTimestamp"],
			}];
		case "storage": {
			const commands: CommandSpec[] = [
				{ label: "storage classes", command: "kubectl", args: [...base, "get", "storageclasses", "-o", "wide"] },
				{ label: "persistent volumes", command: "kubectl", args: [...base, "get", "persistentvolumes", "-o", "wide"] },
				{ label: "CSI drivers", command: "kubectl", args: [...base, "get", "csidrivers", "-o", "wide"] },
				{ label: "volume attachments", command: "kubectl", args: [...base, "get", "volumeattachments", "-o", "wide"] },
			];
			if (input.namespace !== undefined) {
				commands.push({
					label: "persistent volume claims",
					command: "kubectl",
					args: namespacedGet(input.context, input.namespace, "persistentvolumeclaims", input.selector),
				});
			}
			return commands;
		}
		case "pod_logs": {
			const tail = input.tail === undefined ? 100 : Number(input.tail);
			if (!Number.isInteger(tail) || tail < 1 || tail > 200) throw new Error("tail must be an integer from 1 to 200.");
			const since = input.since === undefined ? "15m" : String(input.since);
			if (!["5m", "15m", "30m", "1h"].includes(since)) throw new Error("since must be 5m, 15m, 30m, or 1h.");
			const args = [
				...base,
				"logs",
				requireName(input.pod, "pod"),
				"--namespace",
				requireName(input.namespace, "namespace"),
				`--tail=${tail}`,
				`--since=${since}`,
			];
			if (input.container !== undefined) args.push("--container", requireName(input.container, "container"));
			return [{ label: "pod logs", command: "kubectl", args }];
		}
		case "auth_can_i":
			return [{
				label: "authorization check",
				command: "kubectl",
				args: [
					...base,
					"auth",
					"can-i",
					requireName(input.verb, "verb"),
					requireName(input.resource, "resource"),
					"--namespace",
					requireName(input.namespace, "namespace"),
				],
			}];
		default:
			throw new Error(`Unsupported kubectl_inspect operation: ${String(input.operation)}`);
	}
}

export function buildGcloudCommands(input: Record<string, unknown>): CommandSpec[] {
	const operation = input.operation as GcloudOperation;
	if (operation === "active_context") {
		return [{
			label: "active gcloud context",
			command: "gcloud",
			args: ["config", "list", "account,core/project", "--format=json"],
		}];
	}
	const project = requireProject(input.project);
	switch (operation) {
		case "gke_clusters":
			return [{
				label: "GKE clusters",
				command: "gcloud",
				args: ["container", "clusters", "list", `--project=${project}`, "--format=table(name,location,status,currentMasterVersion,currentNodeVersion,autopilot.enabled)"],
			}];
		case "gke_cluster":
			return [{
				label: "GKE cluster",
				command: "gcloud",
				args: [
					"container", "clusters", "describe", requireName(input.cluster, "cluster"),
					`--location=${requireName(input.location, "location")}`,
					`--project=${project}`,
					"--format=json(name,location,status,currentMasterVersion,currentNodeVersion,autopilot,releaseChannel,network,subnetwork,privateClusterConfig,workloadIdentityConfig,addonsConfig,resourceLabels)",
				],
			}];
		case "compute_disks":
			return [{
				label: "Compute disks",
				command: "gcloud",
				args: ["compute", "disks", "list", `--project=${project}`, "--format=table(name,zone.basename(),region.basename(),type.basename(),sizeGb,status,users.len())"],
			}];
		case "compute_disk":
			return [{
				label: "Compute disk",
				command: "gcloud",
				args: [
					"compute", "disks", "describe", requireName(input.disk, "disk"),
					`--zone=${requireName(input.zone, "zone")}`,
					`--project=${project}`,
					"--format=json(name,zone,region,type,sizeGb,status,users,labels,physicalBlockSizeBytes,provisionedIops,provisionedThroughput,onUpdateAction)",
				],
			}];
		case "project_quotas":
			return [{
				label: "project quotas",
				command: "gcloud",
				args: ["compute", "project-info", "describe", `--project=${project}`, "--format=json(quotas)"],
			}];
		case "service_accounts":
			return [{
				label: "service accounts",
				command: "gcloud",
				args: ["iam", "service-accounts", "list", `--project=${project}`, "--format=table(email,displayName,disabled)"],
			}];
		case "asset_inventory": {
			const view = input.view === undefined ? "summary" : String(input.view);
			if (!["names", "summary"].includes(view)) throw new Error("view must be names or summary.");
			const format = view === "names"
				? "--format=csv[no-heading](name)"
				: "--format=csv[no-heading](assetType,name,displayName,location,state,createTime,updateTime,parent,labels)";
			const args = [
				"asset", "search-all-resources", `--scope=projects/${project}`, "--limit=1000", format,
			];
			const assetTypes = optionalAssetTypes(input.assetTypes);
			if (assetTypes) args.push(`--asset-types=${assetTypes.join(",")}`);
			const query = optionalBoundedText(input.query, "query");
			if (query) args.push(`--query=${query}`);
			return [{ label: "Cloud Asset Inventory", command: "gcloud", args }];
		}
		case "activity_history": {
			const freshness = input.freshness === undefined ? "400d" : String(input.freshness);
			if (!["1d", "7d", "30d", "90d", "180d", "400d"].includes(freshness)) {
				throw new Error("freshness must be 1d, 7d, 30d, 90d, 180d, or 400d.");
			}
			const limit = input.limit === undefined ? 100 : Number(input.limit);
			if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("limit must be an integer from 1 to 200.");
			const resourceName = optionalBoundedText(input.resourceName, "resourceName", 1000);
			const activityFilter = optionalBoundedText(input.activityFilter, "activityFilter", 500);
			const filters = ['log_id("cloudaudit.googleapis.com/activity")'];
			if (resourceName) filters.push(`protoPayload.resourceName="${resourceName.replaceAll('"', '\\"')}"`);
			if (activityFilter) filters.push(`(${activityFilter})`);
			return [{
				label: "Admin Activity history",
				command: "gcloud",
				args: [
					"logging", "read", filters.join(" AND "), `--project=${project}`,
					`--freshness=${freshness}`, `--limit=${limit}`, "--order=desc",
					"--format=json(timestamp,protoPayload.serviceName,protoPayload.methodName,protoPayload.resourceName,protoPayload.authenticationInfo.principalEmail,protoPayload.requestMetadata.callerSuppliedUserAgent,protoPayload.status.message)",
				],
			}];
		}
		case "logging": {
			const filter = input.filter;
			if (typeof filter !== "string" || filter.length < 1 || filter.length > 500 || /[\r\n]/.test(filter)) {
				throw new Error("filter must be an explicit bounded single-line Cloud Logging filter.");
			}
			const freshness = input.freshness === undefined ? "15m" : String(input.freshness);
			if (!["5m", "15m", "30m", "1h"].includes(freshness)) throw new Error("freshness must be 5m, 15m, 30m, or 1h.");
			const limit = input.limit === undefined ? 50 : Number(input.limit);
			if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer from 1 to 100.");
			return [{
				label: "Cloud Logging",
				command: "gcloud",
				args: [
					"logging", "read", filter, `--project=${project}`, `--freshness=${freshness}`, `--limit=${limit}`,
					"--order=desc", "--format=json(timestamp,severity,resource.type,logName,textPayload,jsonPayload.message)",
				],
			}];
		}
		default:
			throw new Error(`Unsupported gcloud_inspect operation: ${String(input.operation)}`);
	}
}

export function redactSensitiveText(text: string): string {
	return text
		.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
		.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "[REDACTED JWT]")
		.replace(/(authorization\s*:\s*bearer)\s+\S+/gi, "$1 [REDACTED]")
		.replace(/((?:access[_-]?token|id[_-]?token|refresh[_-]?token|password|passwd|api[_-]?key|client[_-]?secret)\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1[REDACTED]");
}

export function boundOutput(text: string): { text: string; truncated: boolean } {
	let output = text;
	let truncated = false;
	const lines = output.split("\n");
	if (lines.length > MAX_OUTPUT_LINES) {
		output = [...lines.slice(0, 80), "[... output truncated ...]", ...lines.slice(-40)].join("\n");
		truncated = true;
	}
	if (Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) {
		const data = Buffer.from(output, "utf8");
		output = `${data.subarray(0, 16 * 1024).toString("utf8")}\n[... output truncated by byte limit ...]\n${data.subarray(data.length - 8 * 1024).toString("utf8")}`;
		truncated = true;
	}
	return { text: output, truncated };
}

async function executeCommands(
	pi: ExtensionAPI,
	commands: CommandSpec[],
	signal: AbortSignal | undefined,
	onUpdate: ((result: any) => void) | undefined,
) {
	const sections: string[] = [];
	for (const spec of commands) {
		onUpdate?.({ content: [{ type: "text", text: `Inspecting ${spec.label}...` }], details: {} });
		const result = await pi.exec(spec.command, spec.args, { signal, timeout: COMMAND_TIMEOUT_MS });
		const stdout = redactSensitiveText(result.stdout || "");
		const stderr = redactSensitiveText(result.stderr || "");
		if (result.code !== 0) {
			throw new Error(`${spec.command} ${spec.label} failed (exit ${result.code}): ${stderr || stdout || "no diagnostic output"}`);
		}
		sections.push(`## ${spec.label}\n${stdout.trim() || "(no output)"}`);
	}
	const bounded = boundOutput(sections.join("\n\n"));
	return {
		content: [{ type: "text" as const, text: bounded.text + (bounded.truncated ? "\n\n[Inspection output was bounded.]" : "") }],
		details: { commands: commands.map(({ label, command, args }) => ({ label, command, args })), truncated: bounded.truncated },
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
			return executeCommands(pi, buildKubectlCommands(params), signal, onUpdate);
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
			return executeCommands(pi, buildGcloudCommands(params), signal, onUpdate);
		},
	});
}
