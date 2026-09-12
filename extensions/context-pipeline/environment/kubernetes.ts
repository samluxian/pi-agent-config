import { Buffer } from "node:buffer";
import { boundedRedactedText } from "../redaction.ts";
import type { EnvironmentProcessorResult } from "../types.ts";

const MAX_ITEMS = 40;
const MAX_IDENTITIES = 100;
const COLUMN_WIDTHS: Record<string, number> = { pods: 12, workloads: 17, services: 12, events: 12 };

function cleanColumn(value: string): string {
	return value === "<none>" ? "" : value;
}

function parseRows(stdout: string, width: number): string[][] | undefined {
	if (!stdout.trim()) return [];
	const rows = stdout.replace(/\r/g, "").trimEnd().split("\n").map((line) => {
		const columns = line.trim().match(/\[[^\]\n]*\]|<none>|\S+/g);
		return columns?.map(cleanColumn) ?? [];
	});
	return rows.every((row) => row.length === width) ? rows : undefined;
}

function numberColumn(value: string): number {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function listColumn(value: string): string[] {
	if (!value) return [];
	const unwrapped = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
	return unwrapped.split(/[\s,]+/).map(cleanColumn).filter(Boolean);
}

function identity(row: string[]) {
	return {
		apiVersion: boundedRedactedText(row[0], 120),
		kind: boundedRedactedText(row[1], 80),
		...(row[2] ? { namespace: boundedRedactedText(row[2], 253) } : {}),
		name: boundedRedactedText(row[3], 253),
	};
}

function identityKey(row: string[]): string {
	return `${boundedRedactedText(row[1], 80)}:${row[2] ? `${boundedRedactedText(row[2], 253)}/` : ""}${boundedRedactedText(row[3], 253)}`;
}

function podProjection(row: string[]) {
	const readiness = listColumn(row[8]);
	const restarts = listColumn(row[9]).reduce((total, value) => total + numberColumn(value), 0);
	const reasons = [...listColumn(row[10]), ...listColumn(row[11])].map((value) => boundedRedactedText(value, 120));
	return {
		...identity(row),
		...(row[4] ? { createdAt: row[4] } : {}),
		phase: row[5] || "Unknown",
		...(row[6] ? { node: row[6] } : {}),
		...(row[7] ? { serviceAccount: row[7] } : {}),
		ready: `${readiness.filter((value) => value === "true").length}/${readiness.length}`,
		restarts,
		...(reasons.length ? { reasons } : {}),
	};
}

function workloadProjection(row: string[]) {
	return {
		...identity(row),
		...(row[4] ? { createdAt: row[4] } : {}),
		desired: numberColumn(row[5] || row[11]),
		current: numberColumn(row[6] || row[12]),
		ready: numberColumn(row[7] || row[13]),
		available: numberColumn(row[8] || row[14]),
		updated: numberColumn(row[9] || row[15]),
		unavailable: numberColumn(row[10] || row[16]),
	};
}

function serviceProjection(row: string[]) {
	const base = identity(row);
	if (row[1] === "EndpointSlice") {
		const readiness = listColumn(row[10]);
		return {
			...base,
			service: boundedRedactedText(row[6], 253),
			addressType: boundedRedactedText(row[7], 40),
			ports: listColumn(row[11]).map(numberColumn),
			endpointReadiness: {
				reported: readiness.length,
				ready: readiness.filter((value) => value === "true").length,
				notReady: readiness.filter((value) => value === "false").length,
			},
		};
	}
	const targetPorts = listColumn(row[9]);
	return {
		...base,
		type: boundedRedactedText(row[4] || "ClusterIP", 40),
		...(row[5] ? { clusterIP: row[5] } : {}),
		ports: listColumn(row[8]).map((port, index) => ({
			port: numberColumn(port),
			targetPort: targetPorts[index] || "",
		})),
	};
}

function eventProjection(row: string[]) {
	return {
		...identity(row),
		type: boundedRedactedText(row[4], 40),
		reason: boundedRedactedText(row[5], 120),
		count: numberColumn(row[6]) || 1,
		regarding: {
			kind: boundedRedactedText(row[7], 80),
			name: boundedRedactedText(row[8], 253),
		},
		...(row[9] ? { firstTimestamp: row[9] } : {}),
		...(row[10] ? { lastTimestamp: row[10] } : {}),
		...(row[11] ? { eventTime: row[11] } : {}),
	};
}

function selectProjections(operation: string, rows: string[][]): { mode: string; items: any[] } {
	if (operation === "pods") {
		const pods = rows.map(podProjection);
		return {
			mode: "anomalies",
			items: pods.filter((pod) => {
				const [ready, total] = String(pod.ready).split("/").map(Number);
				return pod.phase !== "Running" || total === 0 || ready !== total || pod.restarts > 0 || pod.reasons;
			}),
		};
	}
	if (operation === "workloads") {
		const workloads = rows.map(workloadProjection);
		return {
			mode: "anomalies",
			items: workloads.filter((workload) => workload.ready < workload.desired || workload.available < workload.desired || workload.unavailable > 0),
		};
	}
	if (operation === "services") return { mode: "all", items: rows.map(serviceProjection) };
	return {
		mode: "all",
		items: [...rows]
			.sort((left, right) => String(left[10] || "").localeCompare(String(right[10] || "")))
			.map(eventProjection),
	};
}

export function summarizeKubernetesProjection(operation: string, stdout: string): EnvironmentProcessorResult | undefined {
	const width = COLUMN_WIDTHS[operation];
	if (!width) return undefined;
	const rows = parseRows(stdout, width);
	if (!rows || !rows.every((row) => row[0] && row[1] && row[3])) return undefined;

	const projected = selectProjections(operation, rows);
	const kindCounts: Record<string, number> = {};
	for (const row of rows) kindCounts[row[1]] = (kindCounts[row[1]] || 0) + 1;
	const detailsTruncated = projected.items.length > MAX_ITEMS;
	const identitiesTruncated = rows.length > MAX_IDENTITIES;
	const output = {
		schema_version: "environment-summary/v1",
		domain: "kubernetes",
		operation,
		source_complete: true,
		complete: !detailsTruncated && !identitiesTruncated,
		item_count: rows.length,
		kind_counts: Object.fromEntries(Object.entries(kindCounts).sort()),
		projection_mode: projected.mode,
		projected_item_count: projected.items.length,
		intentionally_omitted_item_count: projected.mode === "anomalies" ? rows.length - projected.items.length : 0,
		resource_index_truncated: identitiesTruncated,
		resource_index: rows.slice(0, MAX_IDENTITIES).map(identityKey),
		items_truncated: detailsTruncated,
		items: projected.items.slice(0, MAX_ITEMS),
		...(operation === "events" ? { order: "ascending-lastTimestamp" } : {}),
	};
	const text = JSON.stringify(output);
	if (rows.length > 0 && Buffer.byteLength(text, "utf8") >= Buffer.byteLength(stdout, "utf8")) return undefined;
	return { text, processor: `kubernetes-${operation}` };
}
