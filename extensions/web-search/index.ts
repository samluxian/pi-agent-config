import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface SearchArgs {
	query?: string;
	exactPhrases?: string[];
	excludeTerms?: string[];
	site?: string;
	count?: number;
}

function cleanItems(values?: string[]): string[] {
	return (values ?? [])
		.map((value) => value.trim().replace(/\s+/g, " "))
		.filter(Boolean);
}

function buildQuery(args: SearchArgs): string {
	const query = args.query?.trim().replace(/\s+/g, " ");
	const exactPhrases = cleanItems(args.exactPhrases);
	if (!query && exactPhrases.length === 0) {
		throw new Error("Provide query or exactPhrases.");
	}

	const parts = [query ?? ""];
	parts.push(...exactPhrases.map((phrase) => `"${phrase.replace(/"/g, "\\\"")}"`));
	parts.push(...cleanItems(args.excludeTerms).map((term) => `-${term.includes(" ") ? `"${term}"` : term}`));
	if (args.site?.trim()) parts.push(`site:${args.site.trim().replace(/^site:/i, "")}`);
	return parts.filter(Boolean).join(" ");
}

function searxngBaseUrl(): URL {
	const value = process.env.SEARXNG_BASE_URL;
	if (!value) throw new Error("Missing SEARXNG_BASE_URL, for example https://search.example.internal.");
	const url = new URL(value);
	if (!["http:", "https:"].includes(url.protocol)) {
		throw new Error("SEARXNG_BASE_URL must use HTTP or HTTPS.");
	}
	return url;
}

async function search(query: string, count: number, signal?: AbortSignal): Promise<SearchResult[]> {
	const endpoint = new URL("search", `${searxngBaseUrl().toString().replace(/\/?$/, "/")}`);
	endpoint.searchParams.set("q", query);
	endpoint.searchParams.set("format", "json");
	const response = await fetch(endpoint, { signal });
	if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}.`);
	const payload = (await response.json()) as {
		results?: Array<{ title?: string; url?: string; content?: string }>;
	};
	return (payload.results ?? [])
		.filter((result): result is Required<typeof result> => Boolean(result.title && result.url))
		.slice(0, count)
		.map((result) => ({
			title: result.title,
			url: result.url,
			snippet: result.content?.replace(/\s+/g, " ").trim() ?? "",
		}));
}

function formatResults(results: SearchResult[]): string {
	if (results.length === 0) return "No results found.";
	return results.map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`).join("\n\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search a self-hosted SearXNG JSON endpoint. Returns title, URL, and snippet.",
		promptSnippet: "Search the web through the configured self-hosted SearXNG endpoint.",
		promptGuidelines: [
			"Use web_search for external discovery only; verify material claims against primary sources.",
		],
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Base search query." })),
			exactPhrases: Type.Optional(Type.Array(Type.String({ description: "Exact phrases to match." }))),
			excludeTerms: Type.Optional(Type.Array(Type.String({ description: "Terms or phrases to exclude." }))),
			site: Type.Optional(Type.String({ description: "Optional site/domain restriction." })),
			count: Type.Optional(Type.Number({ description: "Result count (default 5, max 10).", minimum: 1, maximum: 10 })),
		}),
		async execute(_toolCallId, params: SearchArgs, signal) {
			const query = buildQuery(params);
			const results = await search(query, Math.min(params.count ?? 5, 10), signal);
			return {
				content: [{ type: "text" as const, text: formatResults(results) }],
				details: { query, resultCount: results.length },
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			try {
				const query = buildQuery(args as SearchArgs);
				text.setText(theme.fg("toolTitle", theme.bold("search ")) + theme.fg("accent", `"${query.slice(0, 70)}"`));
			} catch {
				text.setText(theme.fg("error", "search (invalid query)"));
			}
			return text;
		},
		renderResult(result, { expanded, isPartial }, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			if (isPartial) {
				text.setText(theme.fg("warning", "Searching…"));
				return text;
			}
			if (context.isError) {
				text.setText(theme.fg("error", result.content.find((item) => item.type === "text")?.text ?? "Search failed"));
				return text;
			}
			const content = result.content.find((item) => item.type === "text")?.text ?? "";
			const count = (result.details as { resultCount?: number }).resultCount ?? 0;
			text.setText(expanded ? theme.fg("dim", content.slice(0, 500)) : theme.fg("success", `${count} results`));
			return text;
		},
	});
}
