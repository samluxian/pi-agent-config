import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const TOOL_RESULT_HEAD_LINES = 80;
export const TOOL_RESULT_TAIL_LINES = 40;
export const TOOL_RESULT_MAX_BYTES = 24 * 1024;
export const HISTORICAL_RESULT_MAX_LINES = 40;
export const HISTORICAL_RESULT_MAX_BYTES = 8 * 1024;
export const RECENT_TOOL_RESULTS_TO_KEEP = 6;

interface TextCompaction {
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
  outputLines: number;
  outputBytes: number;
}

type ContextMessage = {
  role?: string;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  content?: unknown;
  [key: string]: unknown;
};

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function utf8Prefix(text: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function utf8Suffix(text: string, maxBytes: number): string {
  let bytes = 0;
  const result: string[] = [];
  const characters = Array.from(text);
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index];
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    result.push(character);
    bytes += size;
  }
  return result.reverse().join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

export function truncateToolText(text: string, archivePath?: string): TextCompaction {
  const lines = text.split(/\r?\n/);
  const totalLines = lineCount(text);
  const totalBytes = Buffer.byteLength(text);
  const truncated =
    totalLines > TOOL_RESULT_HEAD_LINES + TOOL_RESULT_TAIL_LINES ||
    totalBytes > TOOL_RESULT_MAX_BYTES;

  if (!truncated) {
    return {
      content: text,
      truncated: false,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
    };
  }

  const headEnd = Math.min(TOOL_RESULT_HEAD_LINES, lines.length);
  const tailStart = Math.max(headEnd, lines.length - TOOL_RESULT_TAIL_LINES);
  let head = lines.slice(0, headEnd).join("\n");
  let tail = lines.slice(tailStart).join("\n");

  const textBudget = TOOL_RESULT_MAX_BYTES - 1024;
  if (Buffer.byteLength(head) + Buffer.byteLength(tail) > textBudget) {
    const tailBudget = Math.min(Buffer.byteLength(tail), Math.floor(textBudget / 3));
    head = utf8Prefix(head, textBudget - tailBudget);
    tail = utf8Suffix(tail, textBudget - Buffer.byteLength(head));
  }

  const kept = [head, tail].filter(Boolean).join("\n");
  const archiveNotice = archivePath
    ? `Full output: ${archivePath}`
    : "Full output archive unavailable";
  const notice =
    `[lean-context truncated: showing at most ${TOOL_RESULT_HEAD_LINES} head + ` +
    `${TOOL_RESULT_TAIL_LINES} tail lines from ${totalLines} lines ` +
    `(${formatBytes(totalBytes)} total). ${archiveNotice}.]`;
  const content = `${kept}\n\n${notice}`;

  return {
    content,
    truncated: true,
    totalLines,
    totalBytes,
    outputLines: lineCount(content),
    outputBytes: Buffer.byteLength(content),
  };
}

function textOnlyContent(content: unknown): string | undefined {
  if (!Array.isArray(content) || content.length === 0) return undefined;
  if (!content.every((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "text")) {
    return undefined;
  }
  return content.map((block) => (block as { text?: unknown }).text).filter((text): text is string => typeof text === "string").join("\n");
}

function archivePathFrom(text: string): string | undefined {
  return text.match(/Full output: ([^\]\n]+)\.?\]/)?.[1]?.replace(/\.$/, "");
}

function oneLinePreview(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "no text preview";
  return utf8Prefix(firstLine.replace(/\s+/g, " "), 160);
}

export function compactHistoricalToolResults<T>(
  messages: readonly T[],
  recentResultsToKeep = RECENT_TOOL_RESULTS_TO_KEEP,
): T[] {
  const toolResultIndexes = messages
    .map((message, index) => ({ message: message as ContextMessage, index }))
    .filter(({ message }) => message.role === "toolResult")
    .map(({ index }) => index);
  const recent = new Set(toolResultIndexes.slice(-recentResultsToKeep));

  return messages.map((original, index) => {
    const message = original as ContextMessage;
    if (message.role !== "toolResult" || message.isError || recent.has(index)) return original;

    const text = textOnlyContent(message.content);
    if (text === undefined) return original;
    const lines = lineCount(text);
    const bytes = Buffer.byteLength(text);
    if (lines <= HISTORICAL_RESULT_MAX_LINES && bytes <= HISTORICAL_RESULT_MAX_BYTES) return original;

    const archivePath = archivePathFrom(text);
    const archive = archivePath ? ` Full output: ${archivePath}.` : "";
    const summary =
      `[lean-context archived ${message.toolName ?? "tool"} result: ${lines} visible lines, ` +
      `${formatBytes(bytes)}; preview: ${JSON.stringify(oneLinePreview(text))}.${archive} ` +
      "Tool call/result pairing is preserved; run a narrower probe if omitted evidence is needed.]";

    return {
      ...message,
      content: [{ type: "text", text: summary }],
    } as T;
  });
}

async function archiveFullOutput(text: string): Promise<string | undefined> {
  try {
    const directory = await mkdtemp(join(tmpdir(), "pi-lean-context-"));
    const outputPath = join(directory, "tool-output.txt");
    await writeFile(outputPath, text, { encoding: "utf8", mode: 0o600 });
    return outputPath;
  } catch {
    return undefined;
  }
}

export default function leanContext(pi: ExtensionAPI) {
  let turnStartMs = 0;
  let toolCalls = 0;

  pi.on("turn_start", () => {
    turnStartMs = Date.now();
    toolCalls = 0;
  });

  pi.on("tool_call", () => {
    toolCalls += 1;
  });

  pi.on("tool_result", async (event) => {
    const text = textOnlyContent(event.content);
    if (text === undefined) return;

    const initial = truncateToolText(text);
    if (!initial.truncated) return;

    const archivePath = await archiveFullOutput(text);
    const compacted = truncateToolText(text, archivePath);
    return { content: [{ type: "text", text: compacted.content }] };
  });

  pi.on("context", (event) => {
    return { messages: compactHistoricalToolResults(event.messages) };
  });

  pi.on("turn_end", (event, ctx) => {
    const context = ctx.getContextUsage();
    const responseUsage = event.message.role === "assistant"
      ? {
          input: event.message.usage.input,
          output: event.message.usage.output,
          cacheRead: event.message.usage.cacheRead,
          cacheWrite: event.message.usage.cacheWrite,
          totalTokens: event.message.usage.totalTokens,
        }
      : undefined;

    pi.appendEntry("lean-context-metrics", {
      turnIndex: event.turnIndex,
      latencyMs: turnStartMs > 0 ? Date.now() - turnStartMs : null,
      toolCalls,
      toolResults: event.toolResults.length,
      contextTokens: context?.tokens ?? null,
      contextWindow: context?.contextWindow ?? null,
      contextPercent: context?.percent ?? null,
      responseUsage,
    });
  });
}
