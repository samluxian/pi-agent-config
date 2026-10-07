import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import subagents, {
  composeParallelResult,
  formatResultForParent,
  buildPiArgs,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_SUBAGENT_TIMEOUT_MS,
  loadAgents,
  MAX_SUBAGENT_TASKS,
  normalizeConfig,
  runSubagent,
  validateWorkingDirectory,
  truncLine,
} from "./index.ts";
import environmentInspect, {
  boundOutput,
  buildGcloudCommands,
  buildKubectlCommands,
  redactSensitiveText,
} from "./tools/environment-inspect.ts";

import scoutScope, { checkScoutPath, normalizeScoutScope, SCOUT_SCOPE_ENV } from "./tools/scout-scope.ts";

function profiles() {
  return new Map(loadAgents().map((agent) => [agent.name, agent]));
}

function fakeProcess({ closeOnSignal, successEvent, successEvents } = {}) {
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
    const events = successEvents ?? (successEvent ? [successEvent] : []);
    if (events.length === 0) return;
    setImmediate(() => {
      for (const event of events) proc.stdout.write(`${JSON.stringify(event)}\n`);
      proc.emit("close", 0);
    });
  };
  return proc;
}

function extensionHarness({ allowedAgents } = {}) {
  let tool;
  const handlers = new Map();
  const sentMessages = [];
  const previousAllowlist = process.env.PI_SUBAGENT_ALLOWED;
  if (allowedAgents === undefined) delete process.env.PI_SUBAGENT_ALLOWED;
  else process.env.PI_SUBAGENT_ALLOWED = allowedAgents;
  try {
    subagents({
      registerTool(definition) {
        tool = definition;
      },
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
      sendMessage(message, options) {
        sentMessages.push({ message, options });
      },
    });
  } finally {
    if (previousAllowlist === undefined) delete process.env.PI_SUBAGENT_ALLOWED;
    else process.env.PI_SUBAGENT_ALLOWED = previousAllowlist;
  }
  return { tool, handlers, sentMessages };
}

function toolHarness(options) {
  return extensionHarness(options).tool;
}

test("prompts the parent to isolate high-volume read-only evidence", () => {
  const guidance = toolHarness().promptGuidelines.join("\n");
  assert.match(guidance, /Use subagent when read-only evidence needs multiple searches or reads/);
  assert.match(guidance, /Give scout a confirmed repository\/directory, precise question, bounded search depth, and concise evidence format/);
  assert.match(guidance, /Split only independent searches into parallel tasks/);
  assert.match(guidance, /simple known-path I\/O/);
  assert.match(guidance, /Keep planning, decisions, approval context, evidence reconciliation, validation responsibility, and final delivery judgment in the parent/);
});

test("applies an explicit nested child allowlist without inheriting it into other tests", async () => {
  const tool = toolHarness({ allowedAgents: "scout" });
  await assert.rejects(
    tool.execute("restricted-researcher", { agent: "researcher", task: "Do not run" }, undefined, undefined, { cwd: process.cwd() }),
    /Unknown agent: researcher\. Available agents: scout/,
  );
});

test("loads only three read-only profiles", () => {
  const agents = profiles();
  assert.deepEqual([...agents.keys()].sort(), ["environment-scout", "researcher", "scout"]);
  assert.equal(agents.get("scout").model, "openai/gpt-6-luna");
  assert.equal(agents.get("scout").thinking, "off");
  assert.deepEqual(agents.get("scout").tools, ["read", "grep", "find", "ls"]);
  assert.equal(agents.get("scout").subagentAgents, undefined);
  assert.match(agents.get("scout").systemPrompt, /Default to quick, targeted lookup/);
  assert.match(agents.get("scout").systemPrompt, /Stop once enough\s+evidence answers the question/);
  assert.match(agents.get("scout").systemPrompt, /Include code snippets only when needed/);
  assert.equal(agents.get("researcher").model, "openai/gpt-6-luna");
  assert.equal(agents.get("researcher").thinking, "medium");
  assert.deepEqual(agents.get("researcher").tools, ["web_search", "source_check", "fetch_content", "get_search_content"]);
  assert.equal(agents.get("environment-scout").model, "openai/gpt-6-luna");
  assert.equal(agents.get("environment-scout").thinking, "medium");
  assert.deepEqual(agents.get("environment-scout").tools, ["kubectl_inspect", "gcloud_inspect"]);
  assert.match(agents.get("environment-scout").systemPrompt, /use the existing kube context and authenticated gcloud configuration/);
  assert.match(agents.get("environment-scout").systemPrompt, /Never retrieve Secret or ConfigMap contents, tokens, credentials/);
});

test("validates cwd before spawning and rejects invalid parallel targets before launching siblings", async () => {
  const root = await mkdtemp(join(tmpdir(), "subagent-cwd-"));
  try {
    const file = join(root, "file.txt");
    await writeFile(file, "not a directory");
    assert.equal(await validateWorkingDirectory(root), root);
    for (const cwd of ["", "   ", join(root, "missing"), file]) {
      let spawned = false;
      await assert.rejects(runSubagent(profiles().get("scout"), "Inspect", cwd, undefined, undefined, {
        spawnProcess() { spawned = true; throw new Error("must not spawn"); },
      }), /Invalid subagent cwd/);
      assert.equal(spawned, false);
    }
    await assert.rejects(toolHarness().execute("invalid-batch", { tasks: [
      { agent: "scout", task: "Must not launch", cwd: root },
      { agent: "scout", task: "Invalid target", cwd: "missing" },
    ] }, undefined, undefined, { cwd: root }), /Invalid subagent cwd/);
    await assert.rejects(toolHarness().execute("relative-single", {
      agent: "scout", task: "Invalid target", cwd: "missing",
    }, undefined, undefined, { cwd: root }), (error) => {
      assert.ok(error.message.includes(join(root, "missing")));
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("passes the same absolute cwd to spawn and prompt for short and long tasks", async () => {
  const agent = profiles().get("scout");
  const relativeCwd = "extensions/subagents/..";
  const expectedCwd = join(process.cwd(), "extensions");
  for (const task of ["Inspect named files", "x".repeat(8001)]) {
    const built = await buildPiArgs(agent, task, relativeCwd);
    try {
      assert.equal(built.cwd, expectedCwd);
      const prompt = await readFile(built.args[built.args.indexOf("--append-system-prompt") + 1], "utf8");
      assert.ok(prompt.startsWith(agent.systemPrompt));
      assert.ok(prompt.includes(JSON.stringify(expectedCwd)));
      assert.match(prompt, /find returns paths relative to its search directory/);
      assert.match(prompt, /not permission to scan/);
      if (task.length > 8000) assert.equal(await readFile(built.args.at(-1).slice(1), "utf8"), `Task: ${task}`);
      else assert.equal(built.args.at(-1), `Task: ${task}`);
    } finally {
      await rm(built.tempDir, { recursive: true, force: true });
    }
  }
  const proc = fakeProcess({ successEvent: { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Done" }] } } });
  const result = await runSubagent(agent, "Inspect", relativeCwd, undefined, undefined, {
    spawnProcess(_command, _args, options) {
      assert.equal(options.cwd, expectedCwd);
      proc.start();
      return proc;
    },
  });
  assert.equal(result.exitCode, 0);
});

test("scout distinguishes discovery, missing paths, EOF and permission errors", () => {
  const prompt = profiles().get("scout").systemPrompt;
  assert.match(prompt, /first use ls\/find/);
  assert.match(prompt, /Do not invent conventional directories/);
  assert.match(prompt, /relative to the directory searched/);
  assert.match(prompt, /read offset beyond EOF/);
  assert.match(prompt, /permission errors[\s\S]*do not bypass/);
});

test("scout scope blocks broad search, traversal, prefix siblings and symlink escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "scout-scope-"));
  try {
    const allowed = join(root, "repo");
    const outside = join(root, "repo-other");
    await mkdir(allowed);
    await mkdir(outside);
    await writeFile(join(allowed, "known.tf"), "# fixture");
    await symlink(outside, join(allowed, "escape"));
    const roots = normalizeScoutScope(["repo"], root);
    for (const tool of ["read", "grep", "find", "ls"]) {
      assert.equal(checkScoutPath(tool, { path: allowed }, root, roots), undefined);
      assert.equal(checkScoutPath(tool, { path: "known.tf" }, allowed, roots), undefined);
      assert.match(checkScoutPath(tool, { path: root }, root, roots), /outside allowedPaths/);
      assert.match(checkScoutPath(tool, { path: "../repo-other" }, allowed, roots), /outside allowedPaths/);
      assert.match(checkScoutPath(tool, { path: outside }, allowed, roots), /outside allowedPaths/);
      assert.match(checkScoutPath(tool, { path: "escape/missing.tf" }, allowed, roots), /symlink/);
      assert.match(checkScoutPath(tool, {}, root, roots), /outside allowedPaths/);
    }
    assert.match(checkScoutPath("bash", {}, allowed, roots), /allowlist/);
    assert.match(checkScoutPath("read", { path: "missing.tf" }, allowed, roots), /does not exist/);
    for (const path of ["@/outside", "~/outside", "file:///outside", "x\u00a0y"]) {
      assert.match(checkScoutPath("read", { path }, allowed, roots), /expansion/);
    }
    assert.throws(() => normalizeScoutScope([], root), /explicit allowedPaths/);
    await assert.rejects(toolHarness().execute("missing-scope", {
      agent: "scout", task: "Do not launch",
    }, undefined, undefined, { cwd: allowed }), /explicit allowedPaths/);
    await assert.rejects(toolHarness().execute("invalid-parallel-scope", { tasks: [
      { agent: "scout", task: "Must not launch", allowedPaths: [allowed] },
      { agent: "scout", task: "No scope" },
    ] }, undefined, undefined, { cwd: root }), /explicit allowedPaths/);
    const built = await buildPiArgs(profiles().get("scout"), "Inspect only repo", root, [allowed]);
    try {
      assert.deepEqual(JSON.parse(built.childEnv[SCOUT_SCOPE_ENV]), roots);
      const prompt = await readFile(built.args[built.args.indexOf("--append-system-prompt") + 1], "utf8");
      assert.ok(prompt.includes(`Allowed scout directories (JSON): ${JSON.stringify(roots)}`));
    } finally {
      await rm(built.tempDir, { recursive: true, force: true });
    }
    let handler;
    const previous = process.env[SCOUT_SCOPE_ENV];
    try {
      process.env[SCOUT_SCOPE_ENV] = JSON.stringify(roots);
      scoutScope({ on(name, callback) { assert.equal(name, "tool_call"); handler = callback; } });
      assert.equal(handler({ toolName: "find", input: { path: root } }, { cwd: allowed }).block, true);
      assert.equal(handler({ toolName: "read", input: { path: "known.tf" } }, { cwd: allowed }), undefined);
      process.env[SCOUT_SCOPE_ENV] = "invalid";
      scoutScope({ on(_name, callback) { handler = callback; } });
      assert.equal(handler({ toolName: "read", input: { path: "known.tf" } }, { cwd: allowed }).block, true);
    } finally {
      if (previous === undefined) delete process.env[SCOUT_SCOPE_ENV];
      else process.env[SCOUT_SCOPE_ENV] = previous;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("clamps read-only concurrency", () => {
  assert.equal(normalizeConfig(undefined).maxConcurrency, DEFAULT_MAX_CONCURRENCY);
  assert.equal(normalizeConfig({ maxConcurrency: 0 }).maxConcurrency, 1);
  assert.equal(normalizeConfig({ maxConcurrency: 2.9 }).maxConcurrency, 2);
  assert.equal(normalizeConfig({ maxConcurrency: 99 }).maxConcurrency, MAX_SUBAGENT_TASKS);
  assert.equal(normalizeConfig({ maxConcurrency: "2" }).maxConcurrency, DEFAULT_MAX_CONCURRENCY);
});

test("preserves full parallel results, ordering, failures, and completeness", () => {
  const outputs = ["證據🧪\n".repeat(2000), "long evidence\n".repeat(3000), "", "last sibling"];
  const results = outputs.map((output, index) => ({
    agent: `child-${index}`, output, exitCode: index === 1 ? 1 : 0, outputComplete: index !== 1,
  }));
  const response = composeParallelResult(results);
  assert.equal(response.content[0].text, results.map((result) =>
    `## ${result.agent}${result.exitCode !== 0 ? " (FAILED)" : ""}\n\n${formatResultForParent(result)}`,
  ).join("\n\n---\n\n"));
  assert.ok(Buffer.byteLength(response.content[0].text) > 24 * 1024);
  assert.ok(response.content[0].text.split("\n").length > 600);
  assert.deepEqual(results.map((result) => result.output), outputs);
  assert.equal(response.details.contentComplete, false);
  results[1].outputComplete = true;
  assert.equal(composeParallelResult(results).details.contentComplete, true);
});

test("returns redacted error feedback even when the child omits its errors", () => {
  const result = {
    agent: "scout", exitCode: 0, output: "Evidence collected", outputComplete: true,
    progress: { status: "completed", toolErrors: [
      { tool: "read", diagnostic: "Path not found: example/missing" },
      { tool: "grep", diagnostic: "password=do-not-print" },
    ] },
  };
  const text = formatResultForParent(result);
  assert.match(text, /Evidence collected/);
  assert.match(text, /completed with tool errors; verify recovery/);
  assert.match(text, /read: Path not found/);
  assert.match(text, /grep: .*REDACTED/);
  assert.doesNotMatch(text, /do-not-print/);
  assert.match(text, /when the user has authorized/);
  assert.match(composeParallelResult([result]).content[0].text, /Error feedback for parent/);
  result.progress = {};
  assert.equal(formatResultForParent(result), "Evidence collected");
  for (const errorKind of ["provider", "process", "timeout", "abort"]) {
    result.progress = { errorKind, error: "token=do-not-print" };
    const failure = formatResultForParent(result);
    assert.match(failure, /Outcome: failed/);
    assert.ok(failure.includes(`- ${errorKind}:`));
    assert.doesNotMatch(failure, /do-not-print/);
    assert.match(composeParallelResult([result]).content[0].text, /scout \(FAILED\)/);
  }
  result.exitCode = 2;
  result.progress = {};
  assert.match(formatResultForParent(result), /Child exited with code 2/);
});

test("task contract guidance does not add required fields or completion hooks", () => {
  const { tool, handlers } = extensionHarness();
  assert.match(tool.promptGuidelines.join("\n"), /GOAL, CONTEXT, SCOPE, CONSTRAINTS, APPROACH, ACCEPTANCE, RETURN/);
  assert.match(tool.promptGuidelines.join("\n"), /not an execution gate/);
  assert.equal(tool.parameters.properties.task.type, "string");
  assert.equal(tool.parameters.properties.task.minLength, 1);
  assert.equal(handlers.size, 0);
});

test("does not install a repository review completion gate", () => {
  const { handlers, sentMessages } = extensionHarness();
  assert.equal(handlers.has("tool_result"), false);
  assert.equal(handlers.has("message_end"), false);
  assert.equal(handlers.has("agent_settled"), false);
  assert.equal(sentMessages.length, 0);
});

test("renders calls and results while preserving fallback output", () => {
  const tool = toolHarness();
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  assert.equal(tool.renderCall({ tasks: [{ agent: "scout" }, { agent: "researcher" }] }, theme).text.includes("parallel"), true);
  assert.equal(tool.renderCall({ agent: "scout", task: "password=do-not-print" }, theme).text.includes("REDACTED"), true);
  assert.equal(tool.renderCall({}, theme).text, "subagent");
  assert.equal(tool.renderResult({ content: [{ type: "text", text: "fallback output" }] }, { expanded: false }, theme).text, "fallback output");
  const result = {
    agent: "scout", task: "one\ntwo", output: "final output", exitCode: 0, model: "model",
    usage: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: 0.1, turns: 2 },
    progress: { agent: "scout", status: "completed", task: "one\ntwo", recentTools: [{ tool: "read", args: "file" }], toolCount: 1, tokens: 5, durationMs: 1000, lastMessage: "message", lastToolError: "tool failed", error: "process failed" },
  };
  assert.ok(tool.renderResult({ content: [], details: { mode: "single", results: [result] } }, { expanded: true }, theme));
  result.progress.status = "running";
  result.progress.currentTool = "read";
  result.progress.currentToolArgs = "file";
  assert.ok(tool.renderResult({ content: [], details: { mode: "parallel", results: [result] } }, { expanded: false }, theme));
  assert.equal(truncLine("abcdef", 4), "abc…");
  assert.equal(truncLine("\x1b[31mabcdef", 4), "\x1b[31mabc…");
});

async function assertChildArguments() {
  for (const agent of profiles().values()) {
    const { args, tempDir, childEnv } = await buildPiArgs(agent, "Collect bounded evidence", process.cwd());
    try {
      assert.ok(args.includes("--no-session"));
      assert.ok(args.includes("--no-skills"));
      assert.ok(args.includes("--no-extensions"));
      assert.equal(args[args.indexOf("--model") + 1], agent.model);
      assert.equal(args[args.indexOf("--thinking") + 1], agent.thinking);

      if (agent.name === "scout") {
        assert.equal(args[args.indexOf("--tools") + 1], "read,grep,find,ls");
        assert.equal(args.includes("-e"), false);
        assert.deepEqual(JSON.parse(childEnv[SCOUT_SCOPE_ENV]), [process.cwd()]);
        assert.ok(args.includes("--no-context-files"));
        assert.ok(args.includes(join(process.cwd(), "extensions/subagents/tools/scout-scope.ts")));
      } else if (agent.name === "researcher") {
        assert.equal(args[args.indexOf("--tools") + 1], "web_search,source_check,fetch_content,get_search_content");
        assert.ok(args.some((arg) => arg.endsWith("/.pi/npm/node_modules/pi-web-access/index.ts") || arg.endsWith("/npm/node_modules/pi-web-access/index.ts")));
        assert.equal(childEnv, undefined);
      } else if (agent.name === "environment-scout") {
        assert.equal(args[args.indexOf("--tools") + 1], "kubectl_inspect,gcloud_inspect");
        assert.ok(args.some((arg) => arg.endsWith("/tools/environment-inspect.ts")));
        assert.equal(childEnv, undefined);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

test("builds isolated read-only child arguments with model and exact tools", assertChildArguments);

test("keeps authority in the parent and rejects removed agents", async () => {
  const tool = toolHarness();
  const ctx = { cwd: process.cwd() };
  const guidance = tool.promptGuidelines.join("\n");

  assert.match(guidance, /planning, decisions, approval context/);
  assert.match(guidance, /parent owns edits/);
  assert.doesNotMatch(guidance, /reviewer|clear.*gate/i);
  assert.doesNotMatch(guidance, /delegate \*reasoning and decisions\*/);

  await assert.rejects(
    tool.execute("single-worker", { agent: "worker", task: "Edit one file" }, undefined, undefined, ctx),
    /Unknown agent: worker/,
  );
  await assert.rejects(
    tool.execute("parallel-worker", { tasks: [{ agent: "worker", task: "Edit one file" }] }, undefined, undefined, ctx),
    /Unknown agent: worker/,
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

test("builds only fixed read-only kubectl and gcloud argv", () => {
  assert.deepEqual(buildKubectlCommands({ operation: "current_context" }), [{
    label: "current context",
    command: "kubectl",
    args: ["config", "current-context"],
  }]);
  assert.deepEqual(buildKubectlCommands({ operation: "context_names" }), [{
    label: "context names",
    command: "kubectl",
    args: ["config", "get-contexts", "-o", "name"],
  }]);
  assert.deepEqual(buildGcloudCommands({ operation: "active_context" }), [{
    label: "active gcloud context",
    command: "gcloud",
    args: ["config", "list", "--format=json(core.account,core.project)"],
  }]);
  assert.deepEqual(buildGcloudCommands({ operation: "visible_projects" }), [{
    label: "visible projects (up to 100)",
    command: "gcloud",
    args: ["projects", "list", "--limit=100", "--format=json(projectId,name,lifecycleState)"],
  }]);
  for (const spec of [
    ...buildKubectlCommands({ operation: "context_names" }),
    ...buildGcloudCommands({ operation: "active_context" }),
    ...buildGcloudCommands({ operation: "visible_projects" }),
  ]) {
    assert.doesNotMatch(spec.args.join(" "), /get-credentials|auth print|config view|secrets|token|--account=/i);
  }
  const pods = buildKubectlCommands({ operation: "pods", namespace: "apps", selector: "app=api" });
  assert.equal(pods[0].label, "pods");
  assert.equal(pods[0].command, "kubectl");
  assert.deepEqual(pods[0].args.slice(0, 5), ["get", "pods", "--namespace", "apps", "-o"]);
  assert.match(pods[0].args[5], /^custom-columns=.*SERVICE_ACCOUNT/);
  assert.deepEqual(pods[0].args.slice(6), ["--no-headers", "--selector", "app=api"]);
  const events = buildKubectlCommands({ operation: "events", namespace: "apps" })[0].args;
  assert.deepEqual(events.slice(0, 6), ["get", "events", "--namespace", "apps", "--sort-by=.lastTimestamp", "-o"]);
  assert.match(events[6], /^custom-columns=.*EVENT_TIME/);
  assert.equal(events[7], "--no-headers");
  assert.deepEqual(buildGcloudCommands({ operation: "gke_cluster", project: "valid-project-123", cluster: "primary", location: "us-central1" })[0].args.slice(0, 6), [
    "container", "clusters", "describe", "primary", "--location=us-central1", "--project=valid-project-123",
  ]);
  const assets = buildGcloudCommands({
    operation: "asset_inventory",
    project: "valid-project-123",
    assetTypes: ["compute.googleapis.com/Disk", "storage.googleapis.com/Bucket"],
    view: "names",
  })[0];
  assert.deepEqual(assets.args.slice(0, 4), ["asset", "search-all-resources", "--scope=projects/valid-project-123", "--limit=1000"]);
  assert.ok(assets.args.includes("--format=csv[no-heading](name)"));
  assert.ok(assets.args.includes("--asset-types=compute.googleapis.com/Disk,storage.googleapis.com/Bucket"));
  const activity = buildGcloudCommands({
    operation: "activity_history",
    project: "valid-project-123",
    resourceName: "//compute.googleapis.com/projects/valid-project-123/zones/us-central1-a/disks/data",
    freshness: "400d",
  })[0];
  assert.equal(activity.args[0], "logging");
  assert.match(activity.args[2], /cloudaudit\.googleapis\.com\/activity/);
  assert.match(activity.args[2], /protoPayload\.resourceName/);
  assert.ok(activity.args.includes("--freshness=400d"));
  assert.throws(() => buildKubectlCommands({ operation: "exec", namespace: "apps" }), /Unsupported kubectl_inspect operation/);
  assert.throws(() => buildGcloudCommands({ operation: "get_credentials", project: "valid-project-123" }), /Unsupported gcloud_inspect operation/);
  assert.throws(() => buildGcloudCommands({ operation: "asset_inventory", project: "valid-project-123", assetTypes: ["bad type;delete"] }), /unsupported type pattern/);
  assert.throws(() => buildKubectlCommands({ operation: "pods", namespace: "apps; delete namespace prod" }), /namespace must be an explicit name/);
});

test("environment inspection redacts and bounds potentially sensitive output", () => {
  const redacted = redactSensitiveText('authorization: Bearer abc123 access_token=secret password: hunter2 "client_secret": "quoted-value" token=query-value private_key=pem-value --token cli-secret https://user:pass@example.test/path AKIA1234567890ABCDEF eyJabcdefghijk.abcdefghijkl.abcdefghijkl');
  assert.doesNotMatch(redacted, /abc123|hunter2|quoted-value|query-value|pem-value|cli-secret|user:pass|AKIA1234567890ABCDEF|eyJabcdefghijk/);
  assert.match(redacted, /REDACTED/);
  const bounded = boundOutput(Array.from({ length: 200 }, (_, i) => `line-${i}`).join("\n"));
  assert.equal(bounded.truncated, true);
  assert.match(bounded.text, /inspection output omitted/);
  assert.equal(bounded.contentComplete, false);
  assert.equal(bounded.text.split("\n").length, 120);
  const byteBounded = boundOutput("界".repeat(20_000));
  assert.equal(byteBounded.truncated, true);
  assert.equal(byteBounded.contentComplete, false);
  assert.ok(Buffer.byteLength(byteBounded.text, "utf8") <= 24 * 1024);
  assert.doesNotMatch(byteBounded.text, /�/);
});

test("environment tools pass timeout and abort signal to direct argv execution", async () => {
  const registered = new Map();
  const calls = [];
  const pi = {
    registerTool(tool) { registered.set(tool.name, tool); },
    async exec(command, args, options) {
      calls.push({ command, args, options });
      return { stdout: "apps Active", stderr: "", code: 0, killed: false };
    },
  };
  environmentInspect(pi);
  const controller = new AbortController();
  const result = await registered.get("kubectl_inspect").execute(
    "inspect-1",
    { operation: "namespaces" },
    controller.signal,
    undefined,
  );
  assert.equal(calls[0].command, "kubectl");
  assert.deepEqual(calls[0].args, ["get", "namespaces", "-o", "wide"]);
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.timeout, 30000);
  assert.match(result.content[0].text, /apps Active/);
});

test("environment tools apply structured processors and omit raw argv details", async () => {
  const registered = new Map();
  const healthy = Array.from({ length: 50 }, (_, index) => ["v1", "Pod", "apps", `api-${index}`, "2026-09-12T00:00:00Z", "Running", "node-1", "api", "[true true]", "[0 0]", "[<none> <none>]", "[<none> <none>]"].join(" "));
  const failing = ["v1", "Pod", "apps", "api-failing", "2026-09-12T00:00:00Z", "Pending", "node-1", "api", "[false true]", "[2 0]", "[CrashLoopBackOff <none>]", "[<none> <none>]"].join(" ");
  const podProjection = [...healthy, failing].join("\n");
  environmentInspect({
    registerTool(tool) { registered.set(tool.name, tool); },
    async exec() { return { stdout: podProjection, stderr: "", code: 0, killed: false }; },
  });
  const result = await registered.get("kubectl_inspect").execute(
    "inspect-pods",
    { operation: "pods", namespace: "apps" },
    undefined,
    undefined,
  );
  assert.match(result.content[0].text, /environment-summary\/v1/);
  assert.deepEqual(result.details.processors, ["kubernetes-pods"]);
  assert.deepEqual(result.details.checks, [{ label: "pods", command: "kubectl" }]);
  assert.equal("commands" in result.details, false);
  assert.match(result.content[0].text, /api-failing/);
  const podSummary = JSON.parse(result.content[0].text.split("\n").slice(1).join("\n"));
  assert.equal(podSummary.items.some((item) => item.name === "api-49"), false);
});

test("environment tool failures preserve exit status and bound redacted diagnostics", async () => {
  const registered = new Map();
  environmentInspect({
    registerTool(tool) { registered.set(tool.name, tool); },
    async exec() {
      return {
        stdout: "",
        stderr: `access_token=do-not-print\n${"diagnostic-line\n".repeat(2000)}final-error`,
        code: 1,
        killed: false,
      };
    },
  });
  await assert.rejects(
    registered.get("gcloud_inspect").execute("inspect-fail", { operation: "active_context" }, undefined, undefined),
    (error) => {
      assert.match(error.message, /exit 1; content_complete=false/);
      assert.match(error.message, /REDACTED/);
      assert.match(error.message, /inspection diagnostic omitted/);
      assert.match(error.message, /final-error/);
      assert.doesNotMatch(error.message, /do-not-print/);
      assert.ok(Buffer.byteLength(error.message, "utf8") < 9 * 1024);
      return true;
    },
  );
});

test("redacts child tool previews and retains bounded tool errors", async () => {
  const scout = profiles().get("scout");
  const proc = fakeProcess({
    successEvents: [
      {
        type: "tool_execution_start",
        toolCallId: "read-1",
        toolName: "read",
        args: { path: "password=do-not-print" },
      },
      {
        type: "tool_execution_end",
        toolCallId: "read-1",
        toolName: "read",
        isError: true,
        result: { content: [{ type: "text", text: "password=do-not-print\nvalidation failed" }] },
      },
      {
        type: "message_end",
        message: {
          role: "assistant",
          model: scout.model,
          content: [{ type: "text", text: "Recovered with bounded evidence" }],
          usage: { input: 10, output: 3, cost: { total: 0 } },
        },
      },
    ],
  });
  const result = await runSubagent(scout, "Inspect password=do-not-print in one file", process.cwd(), undefined, undefined, {
    timeoutMs: 1000,
    spawnProcess: () => {
      proc.start();
      return proc;
    },
  });
  assert.equal(result.progress.status, "completed");
  assert.match(result.task, /REDACTED/);
  assert.doesNotMatch(result.task, /do-not-print/);
  assert.match(result.progress.task, /REDACTED/);
  assert.match(result.progress.recentTools[0].args, /REDACTED/);
  assert.doesNotMatch(result.progress.recentTools[0].args, /do-not-print/);
  assert.match(result.progress.lastToolError, /REDACTED/);
  assert.match(result.progress.lastToolError, /validation failed/);
  assert.equal(result.progress.toolErrors.length, 1);
  assert.equal(result.progress.toolErrors[0].tool, "read");
  assert.match(formatResultForParent(result), /completed with tool errors/);
  assert.doesNotMatch(formatResultForParent(result), /do-not-print/);
  assert.doesNotMatch(result.progress.lastToolError, /do-not-print/);
});

test("preserves tool identity when concurrent child calls finish out of order", async () => {
  const scout = profiles().get("scout");
  const proc = fakeProcess({
    successEvents: [
      { type: "tool_execution_start", toolCallId: "read-1", toolName: "read", args: { path: "README.md" } },
      { type: "tool_execution_start", toolCallId: "grep-1", toolName: "grep", args: { pattern: "reviewer" } },
      { type: "tool_execution_end", toolCallId: "grep-1", toolName: "grep", isError: false, result: {} },
      { type: "tool_execution_end", toolCallId: "read-1", toolName: "read", isError: false, result: {} },
      {
        type: "message_end",
        message: {
          role: "assistant",
          model: scout.model,
          content: [{ type: "text", text: "Concurrent evidence collected" }],
          usage: { input: 10, output: 3, cost: { total: 0 } },
        },
      },
    ],
  });
  const result = await runSubagent(scout, "Concurrent identity test", process.cwd(), undefined, undefined, {
    timeoutMs: 1000,
    spawnProcess: () => {
      proc.start();
      return proc;
    },
  });
  assert.deepEqual(result.progress.recentTools, [
    { toolCallId: "grep-1", tool: "grep", args: "reviewer" },
    { toolCallId: "read-1", tool: "read", args: "README.md" },
  ]);
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
  assert.equal(result.outputComplete, true);
  assert.equal(result.outputStats.sourceBytes, Buffer.byteLength("Evidence collected"));
  assert.equal(result.usage.turns, 1);
});

test("redacts but preserves a large child response with explicit completeness", async () => {
  const scout = profiles().get("scout");
  const childText = `password=do-not-print\n${"證據🧪 evidence-line\n".repeat(2000)}final conclusion`;
  const proc = fakeProcess({
    successEvent: {
      type: "message_end",
      message: {
        role: "assistant",
        model: scout.model,
        content: [{ type: "text", text: childText }],
        usage: { input: 10, output: 3, cost: { total: 0 } },
      },
    },
  });
  const result = await runSubagent(scout, "Large output test", process.cwd(), undefined, undefined, {
    timeoutMs: 1000,
    spawnProcess: () => {
      proc.start();
      return proc;
    },
  });
  assert.equal(result.outputComplete, true);
  assert.equal(result.output, redactSensitiveText(childText));
  assert.equal(result.outputStats.sourceBytes, result.outputStats.emittedBytes);
  assert.equal(result.outputStats.sourceLines, result.outputStats.emittedLines);
  assert.ok(Buffer.byteLength(result.output, "utf8") > 16 * 1024);
  assert.ok(result.output.split("\n").length > 400);
  assert.doesNotMatch(result.output, /content_complete=false/);
  assert.match(result.output, /final conclusion/);
  assert.match(result.output, /REDACTED/);
  assert.doesNotMatch(result.output, /do-not-print/);
});

test("distinguishes a recovered task from a failed task in tool-error display", () => {
  const tool = toolHarness();
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const result = {
    agent: "scout", task: "Inspect a known path", output: "", usage: {},
    progress: { status: "completed", toolCount: 2, tokens: 10, durationMs: 20,
      recentTools: [], lastToolError: "Path not found: example/missing" },
  };
  const render = () => tool.renderResult(
    { details: { mode: "single", results: [result] } }, { expanded: true }, theme,
  ).render(120).join("\n");
  assert.match(render(), /Last tool error \(task recovered\): Path not found/);
  result.progress.status = "failed";
  assert.match(render(), /Last tool error: Path not found/);
  assert.doesNotMatch(render(), /task recovered/);
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
  assert.equal(result.progress.timeoutMs, 5);
  assert.equal(result.progress.timedOut, true);
  assert.equal(result.progress.errorKind, "timeout");
  assert.match(formatResultForParent(result), /- timeout:/);
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
  assert.equal(result.progress.errorKind, "abort");
  assert.match(formatResultForParent(result), /- abort:/);
});
