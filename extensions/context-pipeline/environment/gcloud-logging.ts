import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { boundedRedactedText } from "../redaction.ts";
import type { EnvironmentProcessorResult } from "../types.ts";

const MAX_GROUPS = 25;
type JsonObject = Record<string, any>;

function object(value: unknown): JsonObject {
	return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function strictObjectArray(value: unknown): JsonObject[] | undefined {
	if (!Array.isArray(value)) return undefined;
	if (!value.every((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item))) return undefined;
	return value as JsonObject[];
}

function shortLogName(value: unknown): string {
	const text = String(value || "");
	const marker = "/logs/";
	const index = text.indexOf(marker);
	const suffix = index < 0 ? text : text.slice(index + marker.length);
	try {
		return boundedRedactedText(decodeURIComponent(suffix), 160);
	} catch {
		return boundedRedactedText(suffix, 160);
	}
}

function message(entry: JsonObject): string {
	const jsonPayload = object(entry.jsonPayload);
	return boundedRedactedText(entry.textPayload || jsonPayload.message || "(no projected message)", 600);
}

function orderedEntries(stdout: string): JsonObject[] | undefined {
	const entries = strictObjectArray(JSON.parse(stdout));
	if (!entries) return undefined;
	let previous = Number.POSITIVE_INFINITY;
	for (const entry of entries) {
		const timestamp = Date.parse(String(entry.timestamp || ""));
		if (!Number.isFinite(timestamp) || timestamp > previous) return undefined;
		previous = timestamp;
	}
	return entries;
}

function groupEntries(entries: JsonObject[]): { severityCounts: Record<string, number>; groups: JsonObject[] } {
	const severityCounts: Record<string, number> = {};
	const groups: JsonObject[] = [];
	for (const entry of entries) {
		const severity = String(entry.severity || "DEFAULT");
		severityCounts[severity] = (severityCounts[severity] || 0) + 1;
		const resourceType = String(object(entry.resource).type || "");
		const logName = shortLogName(entry.logName);
		const projectedMessage = message(entry);
		const key = JSON.stringify([severity, resourceType, logName, projectedMessage]);
		const previous = groups.at(-1);
		if (previous?.key === key) {
			previous.count += 1;
			previous.oldestTimestamp = String(entry.timestamp || previous.oldestTimestamp || "");
		} else {
			groups.push({ key, newestTimestamp: String(entry.timestamp || ""), oldestTimestamp: String(entry.timestamp || ""), severity, resourceType, logName, message: projectedMessage, count: 1 });
		}
	}
	return { severityCounts, groups };
}

function loggingOutput(entries: JsonObject[], request: Record<string, unknown>, severityCounts: Record<string, number>, groups: JsonObject[]) {
	const groupsTruncated = groups.length > MAX_GROUPS;
	const filter = typeof request.filter === "string" ? request.filter : "";
	return {
		schema_version: "environment-summary/v1", domain: "gcp-logging", operation: "logging", source_complete: true,
		complete: !groupsTruncated,
		coverage: { freshness: String(request.freshness || "15m"), requested_limit: Number(request.limit || 50), returned_count: entries.length, state: entries.length ? "hits" : "no_hits", filter_sha256: createHash("sha256").update(filter).digest("hex").slice(0, 16) },
		order: "descending-timestamp",
		severity_counts: Object.fromEntries(Object.entries(severityCounts).sort()),
		groups_truncated: groupsTruncated,
		omitted_group_count: Math.max(0, groups.length - MAX_GROUPS),
		groups: groups.slice(0, MAX_GROUPS).map(({ key: _key, ...group }) => group),
	};
}

export function summarizeGcloudLogging(stdout: string, request: Record<string, unknown>): EnvironmentProcessorResult | undefined {
	const entries = orderedEntries(stdout);
	if (!entries) return undefined;
	const { severityCounts, groups } = groupEntries(entries);
	const text = JSON.stringify(loggingOutput(entries, request, severityCounts, groups));
	if (entries.length > 0 && Buffer.byteLength(text, "utf8") >= Buffer.byteLength(stdout, "utf8")) return undefined;
	return { text, processor: "gcloud-logging" };
}
