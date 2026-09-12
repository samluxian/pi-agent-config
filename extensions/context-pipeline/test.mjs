import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import contextPipeline from "./index.ts";
import { processEnvironmentOutput } from "./environment-processors.ts";
import { boundEnvironmentStructured } from "./environment/output-budget.ts";
import { processToolResult } from "./pipeline.ts";
import {
  classifyCommand,
  fullOutputPath,
  fullOutputPathFromNativeError,
  openSafeBashOutput,
} from "./policy.ts";
import { runProcessor } from "./processors.ts";
import { boundTextEvidence } from "./text-budget.ts";

async function withBashOutput(text, callback) {
  const directory = await mkdtemp(join(tmpdir(), "context-pipeline-test-"));
  const path = join(directory, "pi-bash-0123456789abcdef.log");
  await writeFile(path, text, { encoding: "utf8", mode: 0o600 });
  try {
    return await callback(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function event(overrides = {}) {
  return {
    toolName: "bash",
    input: { command: "terraform plan -no-color" },
    content: [{ type: "text", text: "x".repeat(4096) }],
    details: {
      truncation: { truncated: true },
      fullOutputPath: join(tmpdir(), "pi-bash-0123456789abcdef.log"),
    },
    isError: false,
    ...overrides,
  };
}

function firstPatchText(patch) {
  assert.ok(patch);
  return patch.content[0].text;
}

async function processTestText(text, overrides = {}) {
  const patch = await processToolResult(event({
    input: { command: "npm test" },
    content: [{ type: "text", text }],
    details: undefined,
    ...overrides,
  }), {});
  return firstPatchText(patch);
}

test("classifies only supported single commands", () => {
  assert.equal(classifyCommand("terraform plan -no-color"), "terraform-plan");
  assert.equal(classifyCommand("tofu plan"), "terraform-plan");
  assert.equal(classifyCommand("scripts/run-terraform.sh plan service dev"), "terraform-plan");
  assert.equal(classifyCommand("helm template sample ./chart"), "helm-manifest");
  assert.equal(classifyCommand("helm install sample ./chart --dry-run"), "helm-manifest");
  assert.equal(classifyCommand("helm upgrade sample ./chart --dry-run=server"), "helm-manifest");
  assert.equal(classifyCommand("npm run test:extensions"), "test-result");
  assert.equal(classifyCommand("pnpm test"), "test-result");
  assert.equal(classifyCommand("node --test extensions/test.mjs"), "test-result");
  assert.equal(classifyCommand("python3 -m unittest discover"), "test-result");
  assert.equal(classifyCommand("pytest -q"), "test-result");
  assert.equal(classifyCommand("bash scripts/component_test.sh"), "test-result");
  assert.equal(classifyCommand("PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover"), "test-result");
  assert.equal(classifyCommand("cd /workspace/project && npm run test:extensions"), "test-result");
  assert.equal(classifyCommand("cd '/workspace/project with spaces' && pytest -q"), "test-result");
  assert.equal(classifyCommand("terraform plan -out=plan.bin"), undefined);
  assert.equal(classifyCommand("terraform plan -json"), undefined);
  assert.equal(classifyCommand("helm template sample ./chart --output-dir rendered"), undefined);
  assert.equal(classifyCommand("terraform planx"), undefined);
  assert.equal(classifyCommand("tofu planner"), undefined);
  assert.equal(classifyCommand("scripts/run-terraform.sh planx service dev"), undefined);
  assert.equal(classifyCommand("helm templatex sample ./chart"), undefined);
  assert.equal(classifyCommand("helm install sample ./chart --dry-runner"), undefined);
  assert.equal(classifyCommand("kubectl get pods"), undefined);
  assert.equal(classifyCommand("terraform plan | tee plan.txt"), undefined);
  assert.equal(classifyCommand("terraform plan; echo done"), undefined);
  assert.equal(classifyCommand("npm test && echo done"), undefined);
  assert.equal(classifyCommand("cd /workspace && npm test && echo done"), undefined);
  assert.equal(classifyCommand("helm template $(sample) ./chart"), undefined);
  assert.equal(classifyCommand("helm template sample ./chart # comment"), undefined);
  assert.equal(classifyCommand("helm template sample ./chart\necho done"), undefined);
});

test("requires explicit truncation metadata and a full-output path", () => {
  assert.equal(fullOutputPath(undefined), undefined);
  assert.equal(fullOutputPath({ truncation: { truncated: false }, fullOutputPath: "/tmp/x" }), undefined);
  assert.equal(fullOutputPath({ truncation: { truncated: true } }), undefined);
  assert.equal(
    fullOutputPath({ truncation: { truncated: true }, fullOutputPath: "/tmp/pi-bash-0123456789abcdef.log" }),
    "/tmp/pi-bash-0123456789abcdef.log",
  );
});

test("extracts only a native pi bash full-output path from error text", () => {
  assert.equal(fullOutputPathFromNativeError("ordinary error"), undefined);
  assert.equal(
    fullOutputPathFromNativeError("[Showing lines 1-2 of 3. Full output: /tmp/pi-bash-0123456789abcdef.log]"),
    "/tmp/pi-bash-0123456789abcdef.log",
  );
  assert.equal(fullOutputPathFromNativeError("Full output: /tmp/other.log"), undefined);
});

test("opens only regular pi bash output files below the input limit", async () => {
  await withBashOutput("sample", async (path) => {
    const handle = await openSafeBashOutput(path);
    assert.ok(handle);
    await handle.close();

    const link = join(tmpdir(), "pi-bash-fedcba9876543210.log");
    await symlink(path, link);
    try {
      assert.equal(await openSafeBashOutput(link), undefined);
    } finally {
      await rm(link, { force: true });
    }
  });
  assert.equal(await openSafeBashOutput("relative.log"), undefined);
  assert.equal(await openSafeBashOutput(join(tmpdir(), "other.log")), undefined);

  const outside = await mkdtemp(join(process.cwd(), ".context-pipeline-outside-"));
  const linkedDirectory = join(tmpdir(), `context-pipeline-link-${process.pid}`);
  await writeFile(join(outside, "pi-bash-abcdef0123456789.log"), "sample", { mode: 0o600 });
  await symlink(outside, linkedDirectory);
  try {
    assert.equal(
      await openSafeBashOutput(join(linkedDirectory, "pi-bash-abcdef0123456789.log")),
      undefined,
    );
  } finally {
    await rm(linkedDirectory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("transforms eligible bash and safe_bash text while preserving non-text blocks", async () => {
  const image = { type: "image", data: "AA==", mimeType: "image/png" };
  const patch = await processToolResult(
    event({ content: [{ type: "text", text: "x".repeat(4096) }, image] }),
    {},
    async (request) => ({ kind: request.kind, complete: true, text: '{"complete":true}' }),
  );
  assert.ok(patch);
  assert.equal(patch.content.length, 2);
  assert.match(patch.content[0].text, /deterministic Terraform plan summary/);
  assert.match(patch.content[0].text, /Original output remains available/);
  assert.deepEqual(patch.content[1], image);

  const safePatch = await processToolResult(
    event({ toolName: "safe_bash", content: [{ type: "text", text: "x".repeat(4096) }] }),
    {},
    async (request) => ({ kind: request.kind, complete: true, text: '{"complete":true}' }),
  );
  assert.ok(safePatch);
  assert.match(safePatch.content[0].text, /Terraform plan summary/);
});

test("fails open for errors, unsupported results, runner failures, and expansion", async () => {
  let calls = 0;
  const runner = async (request) => {
    calls += 1;
    return { kind: request.kind, complete: true, text: "y".repeat(8192) };
  };
  assert.equal(await processToolResult(event({ isError: true }), {}, runner), undefined);
  assert.equal(await processToolResult(event({ input: { command: "kubectl get pods" } }), {}, runner), undefined);
  assert.equal(calls, 0);
  assert.equal(await processToolResult(event(), {}, runner), undefined);
  assert.equal(calls, 1);
  assert.equal(
    await processToolResult(event(), {}, async () => { throw new Error("synthetic failure"); }),
    undefined,
  );
});

test("summarizes a complete large test result before native bash truncation", async () => {
  const tap = [
    "TAP version 13",
    ...Array.from({ length: 900 }, (_, index) => `# diagnostic ${index}`),
    "ok 1 - bounded contract",
    "1..1",
    "# tests 1",
    "# suites 1",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
  ].join("\n");
  const text = await processTestText(tap, {
    input: { command: "npm run test:contract" },
  });
  assert.match(text, /deterministic test result summary/);
  assert.match(text, /"runner": "tap"/);
  assert.match(text, /"passed": 1/);
  assert.match(text, /session transcript/);
  assert.ok(Buffer.byteLength(text) < Buffer.byteLength(tap));
});

test("summarizes a nonzero test result from the native error recovery path", async () => {
  const tap = [
    "TAP version 13",
    "not ok 1 - rejects unsafe value",
    "  ---",
    "  error: password=do-not-print",
    "  name: AssertionError",
    "  stack: test.mjs:10:2",
    "  ...",
    "1..1",
    "# tests 1",
    "# pass 0",
    "# fail 1",
  ].join("\n");
  await withBashOutput(tap, async (path) => {
    const nativeError = `${tap}\n${"diagnostic\n".repeat(1200)}\n[Showing lines 1-1211 of 1211. Full output: ${path}]\n\nCommand exited with code 1`;
    const text = await processTestText(nativeError, {
      input: { command: "node --test extensions/failing.test.mjs" },
      isError: true,
    });
    assert.match(text, /"result": "fail"/);
    assert.match(text, /rejects unsafe value/);
    assert.match(text, /REDACTED/);
    assert.doesNotMatch(text, /do-not-print/);
    assert.match(text, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("summarizes a complete nonzero test result before native truncation", async () => {
  const tap = [
    "TAP version 13",
    "not ok 1 - direct failure",
    "  ---",
    "  error: AssertionError: expected true",
    "  ...",
    ...Array.from({ length: 1000 }, (_, index) => `# diagnostic ${index}`),
    "1..1",
    "# tests 1",
    "# pass 0",
    "# fail 1",
    "Command exited with code 1",
  ].join("\n");
  const patch = await processToolResult(event({
    input: { command: "npm test" },
    content: [{ type: "text", text: tap }],
    details: undefined,
    isError: true,
  }), {});
  assert.ok(patch);
  assert.match(patch.content[0].text, /"result": "fail"/);
  assert.match(patch.content[0].text, /direct failure/);
  assert.match(patch.content[0].text, /session transcript/);
});

test("parses unittest and fails open for unrecognized large test-like output", async () => {
  const unittest = [
    "FAIL: test_contract (tests.ContractTest.test_contract)",
    "----------------------------------------------------------------------",
    "Traceback (most recent call last):",
    "  File \"test_contract.py\", line 10, in test_contract",
    "AssertionError: expected true",
    "----------------------------------------------------------------------",
    "Ran 2 tests in 0.100s",
    "",
    "FAILED (failures=1)",
  ].join("\n");
  const output = await runProcessor({
    kind: "test-result",
    input: { type: "text", text: unittest },
    inputComplete: true,
    commandFailed: true,
  });
  assert.ok(output);
  const parsed = JSON.parse(output.text);
  assert.equal(parsed.runner, "unittest");
  assert.equal(parsed.counts.tests, 2);
  assert.equal(parsed.counts.failed, 1);
  assert.equal(parsed.failures[0].id, "test_contract (tests.ContractTest.test_contract)");

  const raw = "unknown\n".repeat(2000);
  assert.equal(await processToolResult(event({
    input: { command: "npm test" },
    content: [{ type: "text", text: raw }],
    details: undefined,
  }), {}), undefined);
});

test("preserves pytest failure details and bounds failure groups", async () => {
  const pytest = [
    "============================= test session starts =============================",
    "=================================== FAILURES ===================================",
    "______________________________ test_contract _______________________________",
    "    def test_contract():",
    " >      assert actual == expected",
    "E       AssertionError: access_token=do-not-print",
    "tests/test_contract.py:10: AssertionError",
    "=========================== short test summary info ============================",
    "FAILED tests/test_contract.py::test_contract - AssertionError",
    "============================== 1 failed in 0.10s ===============================",
  ].join("\n");
  const output = await runProcessor({
    kind: "test-result",
    input: { type: "text", text: pytest },
    inputComplete: true,
    commandFailed: true,
  });
  assert.ok(output);
  const parsed = JSON.parse(output.text);
  assert.equal(parsed.runner, "pytest");
  assert.equal(parsed.counts.failed, 1);
  assert.equal(parsed.failures[0].id, "test_contract");
  assert.match(parsed.failures[0].detail, /tests\/test_contract\.py:10/);
  assert.match(parsed.failures[0].detail, /REDACTED/);
  assert.doesNotMatch(output.text, /do-not-print/);

  const manyFailures = ["TAP version 13"];
  for (let index = 0; index < 40; index++) {
    manyFailures.push(`not ok ${index + 1} - failure-${index}`, "  ---", `  error: failure ${index}`, "  ...");
  }
  manyFailures.push("1..40", "# tests 40", "# pass 0", "# fail 40");
  const bounded = await runProcessor({
    kind: "test-result",
    input: { type: "text", text: manyFailures.join("\n") },
    inputComplete: true,
    commandFailed: true,
  });
  assert.ok(bounded);
  const boundedParsed = JSON.parse(bounded.text);
  assert.equal(boundedParsed.content_complete, false);
  assert.equal(boundedParsed.failure_groups_total, 40);
  assert.ok(boundedParsed.failure_groups_emitted <= 25);
  assert.equal(boundedParsed.failure_groups_omitted, 40 - boundedParsed.failure_groups_emitted);
  assert.ok(Buffer.byteLength(bounded.text, "utf8") <= 16 * 1024);
});

test("captures pytest setup and teardown errors and folds repeated failures", async () => {
  const pytest = [
    "============================= test session starts =============================",
    "==================================== ERRORS ====================================",
    "________________ ERROR at setup of test_contract _________________",
    "E   RuntimeError: setup failed",
    "tests/conftest.py:10: RuntimeError",
    "_______________ ERROR at teardown of test_contract _______________",
    "E   RuntimeError: teardown failed",
    "tests/conftest.py:20: RuntimeError",
    "=========================== short test summary info ===========================",
    "ERROR tests/test_contract.py::test_contract - RuntimeError: setup failed",
    "ERROR tests/test_contract.py::test_contract - RuntimeError: teardown failed",
    "=============================== 2 errors in 0.10s ===============================",
  ].join("\n");
  const pytestOutput = await runProcessor({
    kind: "test-result",
    input: { type: "text", text: pytest },
    inputComplete: true,
    commandFailed: true,
  });
  assert.ok(pytestOutput);
  const pytestParsed = JSON.parse(pytestOutput.text);
  assert.equal(pytestParsed.counts.failed, 2);
  assert.deepEqual(
    pytestParsed.failures.map((failure) => failure.id),
    ["ERROR at setup of test_contract", "ERROR at teardown of test_contract"],
  );

  const repeated = [
    "TAP version 13",
    "not ok 1 - repeated contract",
    "  error: AssertionError: expected true",
    "not ok 2 - repeated contract",
    "  error: AssertionError: expected true",
    "1..2",
    "# tests 2",
    "# pass 0",
    "# fail 2",
  ].join("\n");
  const repeatedOutput = await runProcessor({
    kind: "test-result",
    input: { type: "text", text: repeated },
    inputComplete: true,
    commandFailed: true,
  });
  assert.ok(repeatedOutput);
  const repeatedParsed = JSON.parse(repeatedOutput.text);
  assert.equal(repeatedParsed.failure_groups_total, 1);
  assert.equal(repeatedParsed.failures[0].occurrences, 2);
});

test("bounds large failure detail and reports budget omissions", async () => {
  const tap = ["TAP version 13"];
  for (let index = 0; index < 12; index++) {
    tap.push(
      `not ok ${index + 1} - verbose-${index}`,
      `  error: AssertionError: ${"x".repeat(3000)}-${index}`,
    );
  }
  tap.push("1..12", "# tests 12", "# pass 0", "# fail 12");
  const output = await runProcessor({
    kind: "test-result",
    input: { type: "text", text: tap.join("\n") },
    inputComplete: true,
    commandFailed: true,
  });
  assert.ok(output);
  const parsed = JSON.parse(output.text);
  assert.equal(parsed.content_complete, false);
  assert.equal(parsed.failure_detail_truncated, true);
  assert.equal(parsed.failure_groups_total, 12);
  assert.ok(parsed.failure_groups_omitted > 0);
  assert.ok(Buffer.byteLength(output.text, "utf8") <= 16 * 1024);
});

test("fails open for command-not-found, timeout, signal, and runner crash output", async () => {
  const failures = [
    "/bin/bash: line 1: pytest: command not found\nCommand exited with code 127",
    "TAP version 13\nnot ok 1 - interrupted\n  error: AssertionError\n# tests 1\n# fail 1\nCommand timed out after 5 seconds",
    "TAP version 13\n# tests 1\n# pass 1\n# fail 0\nCommand terminated by signal SIGTERM",
    "TAP version 13\nnot ok 1 - interrupted\n  error: AssertionError\n# tests 1\n# pass 0\n# fail 1\nError: runner crashed\nCommand exited with code 1",
  ];
  for (const failure of failures) {
    const text = `${failure}\n${"diagnostic\n".repeat(900)}`;
    assert.equal(await processToolResult(event({
      input: { command: "npm test" },
      content: [{ type: "text", text }],
      details: undefined,
      isError: true,
    }), {}), undefined);
  }
});

test("runs the Terraform processor against an opened pi bash file", async () => {
  await withBashOutput(
    "  # example_resource.sample will be created\nPlan: 1 to add, 0 to change, 0 to destroy.\n",
    async (inputPath) => {
      const output = await runProcessor({
        kind: "terraform-plan",
        input: { type: "file", path: inputPath },
        inputComplete: true,
        commandFailed: false,
      });
      assert.ok(output);
      const parsed = JSON.parse(output.text);
      assert.equal(parsed.complete, true);
      assert.equal(parsed.resources[0].address, "example_resource.sample");
    },
  );
});

test("runs the Helm processor without emitting secret values", async () => {
  await withBashOutput(
    "apiVersion: v1\nkind: Secret\nmetadata:\n  name: sample-secret\nstringData:\n  password: do-not-emit\n",
    async (inputPath) => {
      const output = await runProcessor({
        kind: "helm-manifest",
        input: { type: "file", path: inputPath },
        inputComplete: true,
        commandFailed: false,
      });
      assert.ok(output);
      assert.doesNotMatch(output.text, /do-not-emit/);
      assert.match(output.text, /password/);
    },
  );
});

test("returns undefined when processor execution is already aborted", async () => {
  await withBashOutput(
    "No changes. Your infrastructure matches the configuration.\n",
    async (inputPath) => {
      const controller = new AbortController();
      controller.abort();
      const output = await runProcessor({
        kind: "terraform-plan",
        input: { type: "file", path: inputPath },
        inputComplete: true,
        commandFailed: false,
        signal: controller.signal,
      });
      assert.equal(output, undefined);
    },
  );
});

test("summarizes safe Kubernetes pod projections and keeps anomaly detail", () => {
  const healthy = Array.from({ length: 60 }, (_, index) => ["v1", "Pod", "apps", `api-${index}`, "2026-09-12T00:00:00Z", "Running", "node-1", "api", "[true true]", "[0 0]", "[<none> <none>]", "[<none> <none>]"].join(" "));
  const failing = ["v1", "Pod", "apps", "api-failing", "2026-09-12T00:00:00Z", "Pending", "node-1", "api", "[false true]", "[3 0]", "[CrashLoopBackOff <none>]", "[<none> <none>]"].join(" ");
  const stdout = [...healthy, failing].join("\n");
  const result = processEnvironmentOutput({ command: "kubectl", operation: "pods", label: "pods", stdout, request: {} });
  assert.ok(result);
  const summary = JSON.parse(result.text);
  assert.equal(summary.complete, true);
  assert.equal(summary.item_count, 61);
  assert.equal(summary.projection_mode, "anomalies");
  assert.equal(summary.intentionally_omitted_item_count, 60);
  assert.equal(summary.items[0].ready, "1/2");
  assert.equal(summary.items[0].restarts, 3);
  assert.match(summary.items[0].reasons[0], /CrashLoopBackOff/);
  assert.ok(Buffer.byteLength(result.text) < Buffer.byteLength(stdout));
});

test("projects Kubernetes workloads, services, endpoints, and ordered events", () => {
  const healthyWorkloads = Array.from({ length: 50 }, (_, index) => ["apps/v1", "Deployment", "apps", `api-${index}`, "2026-09-12T00:00:00Z", "3", "3", "3", "3", "3", "0", "<none>", "<none>", "<none>", "<none>", "<none>", "<none>"].join(" "));
  const failingWorkload = ["apps/v1", "Deployment", "apps", "api-failing", "2026-09-12T00:00:00Z", "3", "3", "2", "2", "3", "1", "<none>", "<none>", "<none>", "<none>", "<none>", "<none>"].join(" ");
  const workloads = processEnvironmentOutput({ command: "kubectl", operation: "workloads", label: "workloads", request: {}, stdout: [...healthyWorkloads, failingWorkload].join("\n") });
  assert.ok(workloads);
  assert.equal(JSON.parse(workloads.text).items[0].unavailable, 1);

  const gap = " ".repeat(80);
  const services = processEnvironmentOutput({
    command: "kubectl", operation: "services", label: "services", request: {},
    stdout: [
      ["v1", "Service", "apps", "api", "ClusterIP", "192.0.2.1", "<none>", "<none>", "[80 443]", "[8080 8443]", "<none>", "<none>"].join(gap),
      ["discovery.k8s.io/v1", "EndpointSlice", "apps", "api-1", "<none>", "<none>", "api", "IPv4", "<none>", "<none>", "[true false]", "[8080 8443]"].join(gap),
    ].join("\n"),
  });
  assert.ok(services);
  const serviceSummary = JSON.parse(services.text);
  assert.equal(serviceSummary.items[1].endpointReadiness.ready, 1);
  assert.equal(serviceSummary.items[1].endpointReadiness.notReady, 1);
  assert.deepEqual(serviceSummary.items[0].ports, [{ port: 80, targetPort: "8080" }, { port: 443, targetPort: "8443" }]);
  assert.deepEqual(serviceSummary.items[1].ports, [8080, 8443]);

  const events = processEnvironmentOutput({
    command: "kubectl", operation: "events", label: "events", request: {},
    stdout: [
      ["v1", "Event", "apps", "event-2", "Normal", "Pulled", "1", "Pod", "api-2", "<none>", "2026-09-12T00:02:00Z", "2026-09-12T00:03:00Z"].join(gap),
      ["v1", "Event", "apps", "event-1", "Warning", "Failed", "2", "Pod", "api-1", "<none>", "2026-09-12T00:01:00Z", "2026-09-12T00:04:00Z"].join(gap),
    ].join("\n"),
  });
  assert.ok(events);
  const eventSummary = JSON.parse(events.text);
  assert.equal(eventSummary.order, "ascending-lastTimestamp");
  assert.deepEqual(eventSummary.items.map((item) => item.lastTimestamp), ["2026-09-12T00:01:00Z", "2026-09-12T00:02:00Z"]);
  assert.deepEqual(eventSummary.items.map((item) => item.eventTime), ["2026-09-12T00:04:00Z", "2026-09-12T00:03:00Z"]);
  assert.equal(eventSummary.items[0].regarding.name, "api-1");
});

test("summarizes Cloud Logging in time order with coverage and exact-repeat folding", () => {
  const stdout = JSON.stringify(Array.from({ length: 20 }, (_, index) => ({
    timestamp: new Date(Date.parse("2026-09-12T00:02:00Z") - index * 1000).toISOString(),
    severity: "ERROR",
    resource: { type: "k8s_container" },
    logName: `projects/example-project/logs/${encodeURIComponent("x".repeat(500))}`,
    textPayload: "access_token=do-not-print",
  })));
  const request = { freshness: "15m", limit: 50, filter: 'severity>=ERROR' };
  const result = processEnvironmentOutput({ command: "gcloud", operation: "logging", label: "Cloud Logging", stdout, request });
  assert.ok(result);
  const summary = JSON.parse(result.text);
  assert.equal(summary.coverage.returned_count, 20);
  assert.equal(summary.coverage.state, "hits");
  assert.equal(summary.groups[0].count, 20);
  assert.equal(summary.groups[0].newestTimestamp, "2026-09-12T00:02:00.000Z");
  assert.equal(summary.groups[0].oldestTimestamp, "2026-09-12T00:01:41.000Z");
  assert.equal(summary.groups[0].logName.length, 160);
  assert.match(result.text, /REDACTED/);
  assert.doesNotMatch(result.text, /do-not-print|example-project|severity>=ERROR/);
});

test("reports bounded Cloud Logging no-hit coverage and folds only consecutive pod logs", () => {
  const empty = processEnvironmentOutput({ command: "gcloud", operation: "logging", label: "Cloud Logging", stdout: "[]", request: { freshness: "5m", limit: 10, filter: "false" } });
  assert.ok(empty);
  assert.equal(JSON.parse(empty.text).coverage.state, "no_hits");

  const stdout = `${Array(100).fill("first").join("\n")}\nsecond\nfirst\n`;
  const logs = processEnvironmentOutput({ command: "kubectl", operation: "pod_logs", label: "pod logs", stdout, request: {} });
  assert.ok(logs);
  const logSummary = JSON.parse(logs.text);
  assert.equal(logSummary.source_line_count, 102);
  assert.deepEqual(logSummary.groups.map((group) => group.count), [100, 1, 1]);
  assert.deepEqual(logSummary.groups.map((group) => group.content), ["first", "second", "first"]);

  const largeJsonLog = `${JSON.stringify({ level: "error", message: "x".repeat(16_340), token: "do-not-print" })}\n`;
  const projectedLog = processEnvironmentOutput({ command: "kubectl", operation: "pod_logs", label: "pod logs", stdout: largeJsonLog, request: {} });
  assert.ok(projectedLog);
  const projectedSummary = JSON.parse(projectedLog.text);
  assert.equal(projectedSummary.content_complete, false);
  assert.equal(projectedSummary.truncated_string_count, 1);
  assert.equal(projectedSummary.redacted_field_count, 1);
  assert.equal(projectedSummary.groups[0].content.token, "[REDACTED]");
  assert.doesNotMatch(projectedLog.text, /do-not-print/);
  assert.ok(Buffer.byteLength(projectedLog.text) < Buffer.byteLength(largeJsonLog));
  assert.equal(processEnvironmentOutput({ command: "kubectl", operation: "pods", label: "pods", stdout: "not json", request: {} }), undefined);
  assert.equal(processEnvironmentOutput({ command: "kubectl", operation: "pods", label: "pods", stdout: JSON.stringify({ kind: "List", items: [{ kind: "Pod", metadata: { name: "valid" } }, "malformed"] }), request: {} }), undefined);

  const unsortedLogs = JSON.stringify([
    { timestamp: "2026-09-12T00:01:00Z", severity: "INFO" },
    { timestamp: "2026-09-12T00:02:00Z", severity: "INFO" },
  ]);
  assert.equal(processEnvironmentOutput({ command: "gcloud", operation: "logging", label: "Cloud Logging", stdout: unsortedLogs, request: {} }), undefined);
  assert.equal(processEnvironmentOutput({ command: "gcloud", operation: "logging", label: "Cloud Logging", stdout: JSON.stringify([{ timestamp: "2026-09-12T00:01:00Z" }, "malformed"]), request: {} }), undefined);

  const manyLogs = Array.from({ length: 30 }, (_, index) => ({
    timestamp: `2026-09-12T00:${String(59 - index).padStart(2, "0")}:00Z`,
    severity: "INFO",
    textPayload: `message-${index}`,
    ignored: "x".repeat(200),
  }));
  const truncated = processEnvironmentOutput({ command: "gcloud", operation: "logging", label: "Cloud Logging", stdout: JSON.stringify(manyLogs), request: {} });
  assert.ok(truncated);
  assert.equal(JSON.parse(truncated.text).complete, false);
  assert.equal(JSON.parse(truncated.text).omitted_group_count, 5);
});

test("bounds environment JSON without breaking completeness metadata", () => {
  const source = JSON.stringify({
    schema_version: "environment-summary/v1",
    complete: true,
    item_count: 200,
    resource_index: Array.from({ length: 200 }, (_, index) => ({ kind: "Pod", name: `pod-${index}`, namespace: "apps" })),
    items: Array.from({ length: 50 }, (_, index) => ({ name: `failing-${index}`, reason: "CrashLoopBackOff", detail: "x".repeat(500) })),
  }, null, 2);
  const bounded = boundEnvironmentStructured(source);
  assert.ok(bounded);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.contentComplete, false);
  assert.ok(Buffer.byteLength(bounded.text, "utf8") < 24 * 1024);
  assert.ok(bounded.text.split("\n").length <= 118);
  const parsed = JSON.parse(bounded.text);
  assert.equal(parsed.complete, false);
  assert.equal(parsed.content_complete, false);
  assert.equal(parsed.output_budget.truncated, true);
  assert.ok(parsed.output_budget.omitted_array_entries.resource_index > 0);
});

test("bounds multibyte text without splitting UTF-8 characters", () => {
  const bounded = boundTextEvidence("證據😀\n".repeat(500), {
    maxLines: 80,
    maxBytes: 1024,
    label: "multibyte evidence",
  });
  assert.equal(bounded.contentComplete, false);
  assert.ok(Buffer.byteLength(bounded.text, "utf8") <= 1024);
  assert.ok(bounded.text.split("\n").length <= 80);
  assert.match(bounded.text, /content_complete=false/);
  assert.doesNotMatch(bounded.text, /�/);

  const tinyBytes = boundTextEvidence("證據😀".repeat(20), {
    maxLines: 10,
    maxBytes: 7,
    label: "multibyte evidence",
  });
  assert.ok(Buffer.byteLength(tinyBytes.text, "utf8") <= 7);
  assert.doesNotMatch(tinyBytes.text, /�/);

  const tinyLines = boundTextEvidence("one\ntwo\nthree", {
    maxLines: 2,
    maxBytes: 1024,
  });
  assert.ok(tinyLines.text.split("\n").length <= 2);
  assert.equal(tinyLines.contentComplete, false);
});

test("package metadata registers Context Pipeline", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.ok(packageJson.pi.extensions.includes("./extensions/context-pipeline"));
});

test("registers one tool-result handler", async () => {
  const handlers = new Map();
  contextPipeline({
    on(name, handler) {
      handlers.set(name, handler);
    },
  });
  assert.deepEqual([...handlers.keys()], ["tool_result"]);
  const result = await handlers.get("tool_result")(
    event({ input: { command: "kubectl get pods" } }),
    { signal: undefined },
  );
  assert.equal(result, undefined);
});
