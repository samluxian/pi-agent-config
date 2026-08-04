/**
 * Session handoff extension - transfer reviewed context to a new focused session.
 *
 * Usage:
 *   /handoff <goal for the new session>
 */

import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  BorderedLoader,
  convertToLlm,
  serializeConversation,
} from "@earendil-works/pi-coding-agent";

export const SYSTEM_PROMPT = `You are a context transfer assistant. Create a concise, self-contained handoff prompt for a new AI session from the effective conversation history and the user's stated next goal.

Evidence and safety rules:
- Preserve the user's scope, operating constraints, explicit approvals, and prohibited actions.
- Separate verified facts from interpretation and unverified assumptions.
- Preserve exact repository names, file paths, identifiers, commands, and validation results only when they are necessary to continue safely.
- Never claim a check passed unless the conversation contains its result.
- Treat branch status, dirty state, remote freshness, deployment state, and runtime state as stale unless the new session revalidates them.
- Never reproduce secrets, tokens, credentials, kubeconfig content, private keys, .env values, or secret plaintext.
- Do not paste long logs, manifests, tool output, or diffs. Summarize only the evidence needed for the next action.
- Do not invent missing facts. Put them under "Open Issues and Unverified Facts".
- End with exactly one concrete next action.

Use exactly these headings:
# Session Handoff
## Goal and Scope
## User Constraints and Approvals
## Verified Current State
## Completed Work
## Relevant Files
## Decisions and Rationale
## Validation
## Open Issues and Unverified Facts
## Next Action

Write the handoff as a prompt the user can submit directly to the new AI session. Do not add a preamble such as "Here is the prompt".`;

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === "message") {
    return entry.message;
  }
  if (entry.type === "compaction") {
    return {
      role: "compactionSummary",
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }
  return undefined;
}

export function getHandoffMessages(branch: SessionEntry[]): AgentMessage[] {
  let compactionIndex = -1;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    if (branch[index].type === "compaction") {
      compactionIndex = index;
      break;
    }
  }

  if (compactionIndex < 0) {
    return branch.map(entryToMessage).filter((message) => message !== undefined);
  }

  const compaction = branch[compactionIndex];
  const firstKeptIndex =
    compaction.type === "compaction"
      ? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId)
      : -1;
  const effectiveBranch = [
    compaction,
    ...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
    ...branch.slice(compactionIndex + 1),
  ];

  return effectiveBranch.map(entryToMessage).filter((message) => message !== undefined);
}

export interface HandoffGenerationRequest {
  goal: string;
  messages: AgentMessage[];
  ctx: ExtensionCommandContext;
}

export type HandoffGenerator = (request: HandoffGenerationRequest) => Promise<string | null>;

export const generateHandoffPrompt: HandoffGenerator = async ({ goal, messages, ctx }) => {
  const conversationText = serializeConversation(convertToLlm(messages));

  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(tui, theme, "Generating session handoff...");
    loader.onAbort = () => done(null);

    const generate = async () => {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
      if (!auth.ok || !auth.apiKey) {
        throw new Error(auth.ok ? `No API key for ${ctx.model!.provider}` : auth.error);
      }

      const { complete } = await import("@earendil-works/pi-ai/compat");
      const response = await complete(
        ctx.model!,
        {
          systemPrompt: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `## Effective Conversation History\n\n${conversationText}\n\n## User's Goal for the New Session\n\n${goal}`,
                },
              ],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          env: auth.env,
          signal: loader.signal,
          cacheRetention: "none",
          sessionId: randomUUID(),
        },
      );

      if (response.stopReason === "aborted") {
        return null;
      }

      return response.content
        .filter((content): content is { type: "text"; text: string } => content.type === "text")
        .map((content) => content.text)
        .join("\n")
        .trim();
    };

    generate()
      .then(done)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Session handoff generation failed:", error);
        ctx.ui.notify(`Session handoff generation failed: ${message}`, "error");
        done(null);
      });

    return loader;
  });
};

export function registerSessionHandoff(
  pi: ExtensionAPI,
  generator: HandoffGenerator = generateHandoffPrompt,
): void {
  pi.registerCommand("handoff", {
    description: "Create a reviewed handoff and continue in a new session",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("handoff requires interactive mode", "error");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
      }

      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify("Usage: /handoff <goal for the new session>", "error");
        return;
      }

      const messages = getHandoffMessages(ctx.sessionManager.getBranch());
      if (messages.length === 0) {
        ctx.ui.notify("No conversation to hand off", "error");
        return;
      }

      const generatedPrompt = await generator({ goal, messages, ctx });
      if (generatedPrompt === null) {
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }
      if (!generatedPrompt.trim()) {
        ctx.ui.notify("Generated handoff was empty", "error");
        return;
      }

      const editedPrompt = await ctx.ui.editor("Review session handoff", generatedPrompt);
      if (editedPrompt === undefined) {
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }
      if (!editedPrompt.trim()) {
        ctx.ui.notify("Handoff cannot be empty", "error");
        return;
      }

      const currentSessionFile = ctx.sessionManager.getSessionFile();
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
        withSession: async (replacementCtx) => {
          replacementCtx.ui.setEditorText(editedPrompt);
          replacementCtx.ui.notify("Handoff ready. Review once more, then submit.", "info");
        },
      });

      if (newSessionResult.cancelled) {
        ctx.ui.notify("New session cancelled", "info");
      }
    },
  });
}

export default function sessionHandoff(pi: ExtensionAPI): void {
  registerSessionHandoff(pi);
}
