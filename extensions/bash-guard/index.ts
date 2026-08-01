import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const sensitivePath = /(^|\/)(\.env(?:\.|$)|kubeconfig|.*\.(?:pem|key|p12|pfx))$/i;
const blockedCommands: Array<[RegExp, string]> = [
  [/\bkubectl\s+(apply|delete|patch|scale|rollout\s+restart)\b/, "Kubernetes mutation"],
  [/\bhelm\s+(upgrade|uninstall)\b/, "Helm mutation"],
  [/\bargocd\s+app\s+(sync|delete|rollback|terminate-op|set|unset)\b/, "Argo CD mutation"],
  [/\bterraform\s+(apply|destroy|import|state\s+\S+)\b/, "Terraform state or infrastructure mutation"],
  [/\bgit\s+(push|commit|merge|rebase|reset|restore|tag|branch|switch|checkout)\b/, "Git mutation"],
  [/\brm\s+[^\n]*-[^\n]*r/, "recursive deletion"],
  [/\b(curl|wget)\b[^\n]*\|\s*(ba)?sh\b/, "remote code piped to a shell"],
  [/\bsudo\b/, "privilege escalation"],
];

function isSensitivePath(value: unknown): boolean {
  return typeof value === "string" && sensitivePath.test(value);
}

export function isUnboundedKubernetesDump(command: string): boolean {
  return command
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !/[|>]/.test(segment))
    .some((segment) => {
      const isGetAll = /\bkubectl\s+get\s+all\b/.test(segment);
      const isAllNamespaces = /(?:^|\s)(?:-A|--all-namespaces)(?:\s|$)/.test(segment);
      const isFullStructuredOutput = /(?:^|\s)(?:-o|--output)(?:=|\s+)(?:yaml|json)(?:\s|$)/.test(segment);
      return isGetAll && isAllNamespaces && isFullStructuredOutput;
    });
}

export default function (pi: ExtensionAPI) {
  const pendingCommands = new Set<string>();
  let lastSuccessfulCommand: string | undefined;

  const resetRepeatGuard = () => {
    pendingCommands.clear();
    lastSuccessfulCommand = undefined;
  };

  pi.on("session_start", resetRepeatGuard);
  pi.on("before_agent_start", resetRepeatGuard);

  pi.on("tool_call", (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      const input = event.input as { path?: unknown };
      if (isSensitivePath(input.path)) {
        return { block: true, reason: "Blocked by bash-guard: sensitive files cannot be modified." };
      }
      return;
    }

    if (event.toolName !== "bash") return;
    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== "string") return;

    for (const [pattern, reason] of blockedCommands) {
      if (pattern.test(command)) {
        return { block: true, reason: `Blocked by bash-guard: ${reason}. Use a read-only check, repo patch, or user-operated command instead.` };
      }
    }

    if (isUnboundedKubernetesDump(command)) {
      return {
        block: true,
        reason: "Blocked by bash-guard: unbounded all-namespace Kubernetes manifest dump. Add a namespace/resource selector or a compact jq/custom-columns summary.",
      };
    }

    const commandKey = command.trim();
    if (pendingCommands.has(commandKey) || lastSuccessfulCommand === commandKey) {
      return {
        block: true,
        reason: "Blocked by bash-guard: identical command already pending or just succeeded. Reuse its evidence or change the scope/input before retrying.",
      };
    }
    pendingCommands.add(commandKey);
  });

  pi.on("tool_result", (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      if (!event.isError) resetRepeatGuard();
      return;
    }
    if (event.toolName !== "bash") return;

    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== "string") return;
    const commandKey = command.trim();
    pendingCommands.delete(commandKey);
    lastSuccessfulCommand = event.isError ? undefined : commandKey;
  });
}
