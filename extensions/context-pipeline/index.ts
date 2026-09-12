import type { ExtensionAPI, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { processToolResult } from "./pipeline.ts";

export default function contextPipeline(pi: ExtensionAPI) {
	pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
		return processToolResult(event, { signal: ctx.signal });
	});
}
