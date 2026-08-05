import assert from "node:assert/strict";
import test from "node:test";
import sessionHandoff, {
  getHandoffMessages,
  registerSessionHandoff,
  SYSTEM_PROMPT,
} from "./index.ts";

function messageEntry(id, role, text) {
  return {
    id,
    parentId: null,
    type: "message",
    timestamp: new Date().toISOString(),
    message: {
      role,
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    },
  };
}

function createCommandHarness(generator) {
  let command;
  const notifications = [];
  const replacementNotifications = [];
  let replacementEditorText;
  let newSessionOptions;

  const pi = {
    registerCommand(name, definition) {
      assert.equal(name, "handoff");
      command = definition;
    },
  };
  registerSessionHandoff(pi, generator);

  const ctx = {
    mode: "tui",
    model: { provider: "test", id: "model" },
    sessionManager: {
      getBranch: () => [messageEntry("message-1", "user", "Continue the task")],
      getSessionFile: () => "/tmp/parent-session.jsonl",
    },
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
      editor: async (_title, initial) => `${initial}\n\nReviewed by user.`,
    },
    newSession: async (options) => {
      newSessionOptions = options;
      await options.withSession({
        ui: {
          setEditorText(text) {
            replacementEditorText = text;
          },
          notify(message, level) {
            replacementNotifications.push({ message, level });
          },
        },
      });
      return { cancelled: false };
    },
  };

  return {
    command: () => command,
    ctx,
    notifications,
    replacementNotifications,
    getReplacementEditorText: () => replacementEditorText,
    getNewSessionOptions: () => newSessionOptions,
  };
}

test("default extension registers the handoff command", () => {
  let registeredName;
  sessionHandoff({
    registerCommand(name) {
      registeredName = name;
    },
  });
  assert.equal(registeredName, "handoff");
});

test("handoff prompt requires evidence, approval, validation, and one next action", () => {
  for (const heading of [
    "## Goal and Scope",
    "## User Constraints and Approvals",
    "## Verified Current State",
    "## Completed Work",
    "## Relevant Files",
    "## Decisions and Rationale",
    "## Validation",
    "## Open Issues and Unverified Facts",
    "## Next Action",
  ]) {
    assert.match(SYSTEM_PROMPT, new RegExp(heading));
  }
  assert.match(SYSTEM_PROMPT, /Never reproduce secrets/);
  assert.match(SYSTEM_PROMPT, /End with exactly one concrete next action/);
  assert.match(SYSTEM_PROMPT, /Treat branch status.*as stale/);
});

test("getHandoffMessages uses the latest compaction and retained messages", () => {
  const old = messageEntry("old", "user", "old raw context");
  const kept = messageEntry("kept", "user", "retained request");
  const retainedReply = messageEntry("retained-reply", "assistant", "retained reply");
  const after = messageEntry("after", "user", "new request");
  const compaction = {
    id: "compaction",
    parentId: "retained-reply",
    type: "compaction",
    timestamp: new Date().toISOString(),
    summary: "verified compacted summary",
    firstKeptEntryId: "kept",
    tokensBefore: 50_000,
  };

  const messages = getHandoffMessages([old, kept, retainedReply, compaction, after]);

  assert.equal(messages.length, 4);
  assert.equal(messages[0].role, "compactionSummary");
  assert.equal(messages[0].summary, "verified compacted summary");
  assert.equal(messages[1].content[0].text, "retained request");
  assert.equal(messages[2].content[0].text, "retained reply");
  assert.equal(messages[3].content[0].text, "new request");
  assert.equal(messages.some((message) => message.content?.[0]?.text === "old raw context"), false);
});

test("handoff requires a goal before generating", async () => {
  let generatorCalls = 0;
  const harness = createCommandHarness(async () => {
    generatorCalls += 1;
    return "unused";
  });

  await harness.command().handler("   ", harness.ctx);

  assert.equal(generatorCalls, 0);
  assert.deepEqual(harness.notifications, [
    { message: "Usage: /handoff <goal for the new session>", level: "error" },
  ]);
});

test("reviewed handoff is transferred to a parent-linked new session", async () => {
  let generationRequest;
  const harness = createCommandHarness(async (request) => {
    generationRequest = request;
    return "# Session Handoff\n\n## Goal and Scope\nContinue safely.";
  });

  await harness.command().handler("  finish validation  ", harness.ctx);

  assert.equal(generationRequest.goal, "finish validation");
  assert.equal(generationRequest.messages.length, 1);
  assert.equal(harness.getNewSessionOptions().parentSession, "/tmp/parent-session.jsonl");
  assert.match(harness.getReplacementEditorText(), /Reviewed by user\.$/);
  assert.deepEqual(harness.replacementNotifications, [
    { message: "Handoff ready. Review once more, then submit.", level: "info" },
  ]);
});

test("cancelling generation does not create a new session", async () => {
  const harness = createCommandHarness(async () => null);

  await harness.command().handler("continue elsewhere", harness.ctx);

  assert.equal(harness.getNewSessionOptions(), undefined);
  assert.deepEqual(harness.notifications, [{ message: "Handoff cancelled", level: "info" }]);
});
