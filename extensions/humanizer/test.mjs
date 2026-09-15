import assert from "node:assert/strict";
import test from "node:test";
import humanizerExtension, {
	buildHumanizerPrompt,
	MAX_INPUT_BYTES,
	MAX_INPUT_LINES,
	REWRITE_REQUEST_MARKER,
	validateHumanizerInput,
} from "./index.ts";

function createHarness({ idle = true, hasUI = true, editorResult } = {}) {
	let command;
	const handlers = new Map();
	const tools = [];
	const sent = [];
	const notifications = [];
	const editorCalls = [];
	const pi = {
		on(name, handler) {
			handlers.set(name, handler);
		},
		registerCommand(name, definition) {
			command = { name, ...definition };
		},
		registerTool(definition) {
			tools.push(definition);
		},
		sendUserMessage(message) {
			sent.push(message);
		},
	};
	const ctx = {
		hasUI,
		isIdle: () => idle,
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
			async editor(title, initial) {
				editorCalls.push({ title, initial });
				return editorResult;
			},
		},
	};

	humanizerExtension(pi);
	return { command, ctx, handlers, tools, sent, notifications, editorCalls };
}

async function runInlineRewrite(source) {
	const harness = createHarness();
	await harness.command.handler(source, harness.ctx);
	assert.equal(harness.sent.length, 1);
	assert.ok(harness.sent[0].includes(JSON.stringify(source)));
	return harness;
}

test("registers only the manual /humanizer command", () => {
	const harness = createHarness();
	assert.equal(harness.command.name, "humanizer");
	assert.match(harness.command.description, /English.*Traditional Chinese/);
	assert.equal(harness.handlers.size, 0);
	assert.equal(harness.tools.length, 0);
});

test("builds a bilingual prompt that preserves facts and returns only the rewrite", () => {
	const source = "Additionally, Kubernetes plays a crucial role in the evolving landscape.";
	const prompt = buildHumanizerPrompt(source);

	assert.ok(prompt.startsWith(`${REWRITE_REQUEST_MARKER}\n`));
	assert.match(prompt, /ENGLISH REVIEW PATTERNS/);
	assert.match(prompt, /TAIWAN TRADITIONAL CHINESE REVIEW PATTERNS/);
	assert.match(prompt, /TECHNICAL WRITING/);
	assert.match(prompt, /Never label the source as AI-written/);
	assert.match(prompt, /Return only the final rewritten text/);
	assert.ok(prompt.includes(JSON.stringify(source)));
});

test("transforms inline English input into one isolated user message", async () => {
	const harness = await runInlineRewrite(
		"In order to achieve this goal, the system has the ability to process requests.",
	);

	assert.equal(harness.editorCalls.length, 0);
	assert.equal(harness.notifications.length, 0);
});

test("includes Taiwan terminology and technical-term safeguards for Chinese input", async () => {
	const harness = await runInlineRewrite("此外，Kubernetes 為企業提供了強大的容器編排能力。");

	assert.match(harness.sent[0], /資訊 rather than 信息/);
	assert.match(harness.sent[0], /Do not change resource names/);
});

test("opens the editor when no inline input is supplied", async () => {
	const source = "[寫作樣本]\n我通常直接說重點。\n[待改寫文字]\n值得注意的是，這項功能至關重要。";
	const harness = createHarness({ editorResult: source });

	await harness.command.handler("", harness.ctx);

	assert.equal(harness.editorCalls.length, 1);
	assert.equal(harness.sent.length, 1);
	assert.ok(harness.sent[0].includes(JSON.stringify(source)));
	assert.match(harness.sent[0], /use the sample only as style evidence/);
});

test("handles cancelled and non-interactive empty input without sending a turn", async () => {
	for (const harness of [
		createHarness({ editorResult: undefined }),
		createHarness({ hasUI: false }),
	]) {
		await harness.command.handler("   ", harness.ctx);
		assert.equal(harness.sent.length, 0);
		assert.equal(harness.notifications.length, 1);
		assert.match(harness.notifications[0].message, /請提供要改寫的文字/);
	}
});

test("does not queue a rewrite while the agent is busy", async () => {
	const harness = createHarness({ idle: false });

	await harness.command.handler("Text", harness.ctx);

	assert.equal(harness.sent.length, 0);
	assert.equal(harness.editorCalls.length, 0);
	assert.match(harness.notifications[0].message, /忙碌中/);
});

test("rejects oversized input instead of truncating source facts", async () => {
	const tooManyBytes = "界".repeat(Math.floor(MAX_INPUT_BYTES / 3) + 1);
	const byteValidation = validateHumanizerInput(tooManyBytes);
	assert.equal(byteValidation.ok, false);
	assert.match(byteValidation.reason, /bytes 上限/);

	const tooManyLines = Array.from({ length: MAX_INPUT_LINES + 1 }, () => "x").join("\n");
	const lineValidation = validateHumanizerInput(tooManyLines);
	assert.equal(lineValidation.ok, false);
	assert.match(lineValidation.reason, /行上限/);

	const harness = createHarness();
	await harness.command.handler(tooManyBytes, harness.ctx);
	assert.equal(harness.sent.length, 0);
	assert.match(harness.notifications[0].message, /請分段處理/);
});

test("keeps no extension state between consecutive invocations", async () => {
	const harness = createHarness();
	await harness.command.handler("first source", harness.ctx);
	await harness.command.handler("second source", harness.ctx);

	assert.equal(harness.sent.length, 2);
	assert.ok(harness.sent[0].includes(JSON.stringify("first source")));
	assert.ok(!harness.sent[0].includes(JSON.stringify("second source")));
	assert.ok(harness.sent[1].includes(JSON.stringify("second source")));
	assert.ok(!harness.sent[1].includes(JSON.stringify("first source")));
});
