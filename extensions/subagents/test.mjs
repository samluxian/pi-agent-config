import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";
import subagents, {
  buildPiArgs,
  DEFAULT_MAX_CONCURRENCY,
  loadAgents,
  MAX_SUBAGENT_TASKS,
  normalizeConfig,
  runSubagent,
} from "./index.ts";

function profiles() {
  return new Map(loadAgents().map((agent) => [agent.name, agent]));
}

function fakeProcess({ closeOnSignal, successEvent } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.signals = [];
  proc.kill = (signal) => {
    proc.signals.push(signal);
    if (signal === closeOnSignal) setImmediate(() => proc.emit("close", null));
    return true;
  };

  proc.start = () => {
    if (!successEvent) return;
    setImmediate(() => {
      proc.stdout.write(`${JSON.stringify(successEvent)}\n`);
      proc.emit("close", 0);
    });
  };
  return proc;
}

function toolHarness() {
  let tool;
  subagents({
    registerTool(definition) {
      tool = definition;
    },
  });
  return tool;
}

test("loads only the two read-only profiles with explicit model and thinking", () => {
  const agents = profiles();
  assert.deepEqual([...agents.keys()].sort(), ["researcher", "scout"]);
  assert.equal(agents.get("scout").model, "openai-codex/gpt-5.6-luna");
  assert.equal(agents.get("scout").thinking, "low");
  assert.deepEqual(agents.get("scout").tools, ["read", "grep", "find", "ls"]);
  assert.equal(agents.get("researcher").model, "openai-codex/gpt-5.6-terra");
  assert.equal(agents.get("researcher").thinking, "low");
  assert.deepEqual(agents.get("researcher").tools, ["web_search", "web_fetch"]);
});

test("clamps concurrency to the fixed one-to-four range", () => {
  assert.equal(normalizeConfig(undefined).maxConcurrency, DEFAULT_MAX_CONCURRENCY);
  assert.equal(normalizeConfig({ maxConcurrency: 0 }).maxConcurrency, 1);
  assert.equal(normalizeConfig({ maxConcurrency: 2.9 }).maxConcurrency, 2);
  assert.equal(normalizeConfig({ maxConcurrency: 99 }).maxConcurrency, MAX_SUBAGENT_TASKS);
  assert.equal(normalizeConfig({ maxConcurrency: "2" }).maxConcurrency, DEFAULT_MAX_CONCURRENCY);
});

test("builds isolated child arguments with model, thinking, and exact tools", async () => {
  for (const agent of profiles().values()) {
    const { args, tempDir } = await buildPiArgs(agent, "Collect bounded evidence", process.cwd());
    try {
      assert.ok(args.includes("--no-session"));
      assert.ok(args.includes("--no-skills"));
      assert.ok(args.includes("--no-extensions"));
      assert.equal(args[args.indexOf("--model") + 1], agent.model);
      assert.equal(args[args.indexOf("--thinking") + 1], "low");

      if (agent.name === "scout") {
        assert.equal(args[args.indexOf("--tools") + 1], "read,grep,find,ls");
      } else {
        assert.ok(args.includes("--no-tools"));
        assert.ok(args.some((arg) => arg.endsWith("/web-search/index.ts")));
        assert.ok(args.some((arg) => arg.endsWith("/web-fetch/index.ts")));
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
});

test("keeps authority in the parent and rejects worker, excess tasks, and mixed modes", async () => {
  const tool = toolHarness();
  const ctx = { cwd: process.cwd() };
  const guidance = tool.promptGuidelines.join("\n");

  assert.match(guidance, /parent must retain planning, decisions, approval context/);
  assert.match(guidance, /delegate only bounded evidence collection/);
  assert.doesNotMatch(guidance, /isolated code changes|delegate \*reasoning and decisions\*/);

  await assert.rejects(
    tool.execute("call-worker", { agent: "worker", task: "Edit a file" }, undefined, undefined, ctx),
    /Unknown agent: worker\. Available agents: researcher, scout|Unknown agent: worker\. Available agents: scout, researcher/,
  );

  const tasks = Array.from({ length: MAX_SUBAGENT_TASKS + 1 }, (_, index) => ({
    agent: "scout",
    task: `Evidence ${index + 1}`,
  }));
  await assert.rejects(
    tool.execute("call-many", { tasks }, undefined, undefined, ctx),
    /Too many subagent tasks: 5\. Maximum is 4/,
  );

  await assert.rejects(
    tool.execute(
      "call-mixed",
      { agent: "scout", task: "One", tasks: [{ agent: "scout", task: "Two" }] },
      undefined,
      undefined,
      ctx,
    ),
    /Provide exactly one mode/,
  );
});

test("parses a successful fake child result without a provider call", async () => {
  const scout = profiles().get("scout");
  const proc = fakeProcess({
    successEvent: {
      type: "message_end",
      message: {
        role: "assistant",
        model: scout.model,
        content: [{ type: "text", text: "Evidence collected" }],
        usage: { input: 10, output: 3, cacheRead: 2, cacheWrite: 0, cost: { total: 0 } },
      },
    },
  });

  const result = await runSubagent(scout, "Inspect one path", process.cwd(), undefined, undefined, {
    timeoutMs: 1000,
    spawnProcess: () => {
      proc.start();
      return proc;
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.progress.status, "completed");
  assert.equal(result.output, "Evidence collected");
  assert.equal(result.usage.turns, 1);
});

test("times out a child and escalates from SIGTERM to SIGKILL", async () => {
  const scout = profiles().get("scout");
  const proc = fakeProcess({ closeOnSignal: "SIGKILL" });
  const result = await runSubagent(scout, "Bounded timeout test", process.cwd(), undefined, undefined, {
    timeoutMs: 5,
    terminateGraceMs: 5,
    spawnProcess: () => proc,
  });

  assert.deepEqual(proc.signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.progress.status, "failed");
  assert.match(result.progress.error, /Subagent timed out after/);
});

test("propagates an existing parent abort to the child", async () => {
  const scout = profiles().get("scout");
  const proc = fakeProcess({ closeOnSignal: "SIGTERM" });
  const controller = new AbortController();
  controller.abort();

  const result = await runSubagent(scout, "Abort test", process.cwd(), controller.signal, undefined, {
    timeoutMs: 1000,
    terminateGraceMs: 5,
    spawnProcess: () => proc,
  });

  assert.deepEqual(proc.signals, ["SIGTERM"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.progress.status, "failed");
  assert.equal(result.progress.error, "Subagent aborted by parent request");
});
