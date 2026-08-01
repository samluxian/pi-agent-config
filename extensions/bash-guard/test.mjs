import assert from "node:assert/strict";
import test from "node:test";
import bashGuard, { isUnboundedKubernetesDump } from "./index.ts";

function harness() {
  const handlers = new Map();
  bashGuard({
    on(name, handler) {
      const existing = handlers.get(name) ?? [];
      existing.push(handler);
      handlers.set(name, existing);
    },
  });
  return {
    async emit(name, event) {
      for (const handler of handlers.get(name) ?? []) {
        const result = await handler(event, {});
        if (result) return result;
      }
    },
  };
}

test("detects only unfiltered all-namespace manifest dumps", () => {
  assert.equal(isUnboundedKubernetesDump("kubectl get all -A -o yaml"), true);
  assert.equal(isUnboundedKubernetesDump("kubectl get all --all-namespaces --output=json"), true);
  assert.equal(isUnboundedKubernetesDump("kubectl get all -n qa -o yaml"), false);
  assert.equal(isUnboundedKubernetesDump("kubectl get all -A -o json | jq '.items | length'"), false);
});

test("blocks an identical pending or immediately repeated successful command", async () => {
  const guard = harness();
  const call = { toolName: "bash", input: { command: "git status --short" } };

  assert.equal(await guard.emit("tool_call", call), undefined);
  assert.match((await guard.emit("tool_call", call)).reason, /already pending/);

  await guard.emit("tool_result", { toolName: "bash", input: call.input, isError: false });
  assert.match((await guard.emit("tool_call", call)).reason, /just succeeded/);
});

test("allows retry after failure and after a successful file edit", async () => {
  const guard = harness();
  const call = { toolName: "bash", input: { command: "git diff --check" } };

  await guard.emit("tool_call", call);
  await guard.emit("tool_result", { toolName: "bash", input: call.input, isError: true });
  assert.equal(await guard.emit("tool_call", call), undefined);
  await guard.emit("tool_result", { toolName: "bash", input: call.input, isError: false });
  await guard.emit("tool_result", { toolName: "edit", input: {}, isError: false });
  assert.equal(await guard.emit("tool_call", call), undefined);
});
