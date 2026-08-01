import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import leanContext, {
  compactHistoricalToolResults,
  TOOL_RESULT_HEAD_LINES,
  TOOL_RESULT_TAIL_LINES,
  truncateToolText,
} from "./index.ts";

test("truncateToolText keeps bounded head and tail evidence", () => {
  const input = Array.from({ length: 140 }, (_, index) => `line-${index + 1}`).join("\n");
  const result = truncateToolText(input, "/tmp/full-output.txt");

  assert.equal(result.truncated, true);
  assert.match(result.content, /^line-1\n/);
  assert.match(result.content, /line-80\nline-101/);
  assert.match(result.content, /line-140/);
  assert.doesNotMatch(result.content, /line-81\n/);
  assert.match(result.content, new RegExp(`${TOOL_RESULT_HEAD_LINES} head \\+ ${TOOL_RESULT_TAIL_LINES} tail`));
  assert.match(result.content, /Full output: \/tmp\/full-output\.txt/);
});

test("truncateToolText bounds a single large UTF-8 line", () => {
  const result = truncateToolText("界".repeat(20_000));
  assert.equal(result.truncated, true);
  assert.ok(result.outputBytes < 25 * 1024);
});

test("historical compaction preserves role and toolCallId", () => {
  const messages = [
    {
      role: "toolResult",
      toolName: "bash",
      toolCallId: "old-call",
      isError: false,
      content: [{ type: "text", text: Array.from({ length: 60 }, (_, i) => `old-${i}`).join("\n") }],
    },
    {
      role: "toolResult",
      toolName: "bash",
      toolCallId: "recent-call",
      isError: false,
      content: [{ type: "text", text: Array.from({ length: 60 }, (_, i) => `recent-${i}`).join("\n") }],
    },
  ];

  const compacted = compactHistoricalToolResults(messages, 1);
  assert.equal(compacted[0].role, "toolResult");
  assert.equal(compacted[0].toolCallId, "old-call");
  assert.match(compacted[0].content[0].text, /^\[lean-context archived bash result:/);
  assert.deepEqual(compacted[1], messages[1]);
});

test("extension archives truncated output and records turn metrics", async () => {
  const handlers = new Map();
  const entries = [];
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    appendEntry(type, data) {
      entries.push({ type, data });
    },
  };
  leanContext(pi);

  handlers.get("turn_start")({ turnIndex: 1, timestamp: Date.now() }, {});
  handlers.get("tool_call")({}, {});
  const input = Array.from({ length: 130 }, (_, index) => `tool-${index}`).join("\n");
  const patched = await handlers.get("tool_result")({ content: [{ type: "text", text: input }] }, {});
  const output = patched.content[0].text;
  const archivePath = output.match(/Full output: ([^\]\n]+)\.?\]/)?.[1]?.replace(/\.$/, "");

  assert.ok(archivePath);
  await access(archivePath);
  assert.equal(await readFile(archivePath, "utf8"), input);

  await handlers.get("turn_end")(
    {
      turnIndex: 1,
      message: {
        role: "assistant",
        usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 0, totalTokens: 18 },
      },
      toolResults: [{}],
    },
    { getContextUsage: () => ({ tokens: 1000, contextWindow: 10_000, percent: 10 }) },
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "lean-context-metrics");
  assert.equal(entries[0].data.toolCalls, 1);
  assert.equal(entries[0].data.contextPercent, 10);
  await rm(dirname(archivePath), { recursive: true, force: true });
});
