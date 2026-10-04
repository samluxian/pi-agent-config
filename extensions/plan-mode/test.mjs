import assert from "node:assert/strict";
import test from "node:test";
import planMode from "./index.ts";

function harness(extraTools = []) {
  const commands = new Map();
  const handlers = new Map();
  let active = ["read", "edit", "write", "bash", "subagent", "other_tool", ...extraTools];
  const entries = [];
  const pi = {
    registerFlag() {},
    registerShortcut() {},
    registerCommand(name, definition) { commands.set(name, definition.handler); },
    on(name, handler) { handlers.set(name, handler); },
    getActiveTools() { return active; },
    setActiveTools(names) { active = names; },
    appendEntry(type, data) { entries.push({ type, data }); },
    getFlag() { return false; },
  };
  planMode(pi);
  const ctx = {
    ui: { theme: { fg: (_color, text) => text }, setStatus() {}, setWidget() {}, notify() {} },
    sessionManager: { getEntries() { return []; } },
  };
  return { commands, handlers, get active() { return active; }, ctx, entries };
}

test("plan mode preserves read-only parent tools and restores original tools", async () => {
  const h = harness();
  await h.commands.get("plan")("", h.ctx);
  assert.deepEqual(h.active, ["read", "subagent"]);
  await h.commands.get("plan")("", h.ctx);
  assert.deepEqual(h.active, ["read", "edit", "write", "bash", "subagent", "other_tool"]);
});

test("plan mode blocks worker in single and parallel requests, including nested calls", async () => {
  const h = harness();
  await h.commands.get("plan")("", h.ctx);
  const call = (toolName, input) => h.handlers.get("tool_call")({ toolName, input });
  for (const agent of ["scout", "researcher", "environment-scout"]) {
    assert.equal(await call("subagent", { agent, task: "inspect" }), undefined);
  }
  assert.equal(await call("subagent", { tasks: [{ agent: "scout" }, { agent: "researcher" }] }), undefined);
  for (const input of [
    { agent: "worker" },
    { tasks: [{ agent: "scout" }, { agent: "worker" }] },
    { tasks: [] },
    { tasks: "invalid" },
    { chain: [{ agent: "scout" }] },
    { agent: "scout", tasks: [{ agent: "scout" }] },
  ]) assert.equal((await call("subagent", input))?.block, true);
  for (const name of ["bash", "edit", "write", "other_tool"]) {
    assert.equal((await call(name, {}))?.block, true);
  }
  assert.equal(await call("read", {}), undefined);
});

test("plan mode preserves and permits read-only code intelligence tools", async () => {
  const tools = ["code_index", "code_index_status", "code_query", "code_context", "code_impact", "code_validate_change"];
  const h = harness(tools);
  await h.commands.get("plan")("", h.ctx);
  assert.deepEqual(h.active, ["read", "subagent", ...tools]);
  for (const toolName of tools) assert.equal(await h.handlers.get("tool_call")({ toolName, input: {} }), undefined);
});

test("planning UI cannot trigger execution or restore write tools", async () => {
  const h = harness();
  await h.commands.get("plan")("", h.ctx);
  const assistant = { role: "assistant", content: [{ type: "text", text: "Plan:\n1. Inspect the repository\n2. Verify results" }] };
  let choices;
  h.ctx.hasUI = true;
  h.ctx.ui.select = async (_title, options) => { choices = options; return options[0]; };
  await h.handlers.get("agent_end")({ messages: [assistant] }, h.ctx);
  assert.deepEqual(choices, ["Stay in plan mode", "Refine the plan"]);
  assert.deepEqual(h.active, ["read", "subagent"]);
  assert.equal(h.entries.at(-1).data.enabled, true);
});
