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

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      const input = event.input as { path?: unknown };
      if (isSensitivePath(input.path)) {
        return { block: true, reason: "Blocked by bash-guard: sensitive files cannot be modified." };
      }
    }

    if (event.toolName !== "bash") return;
    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== "string") return;
    for (const [pattern, reason] of blockedCommands) {
      if (pattern.test(command)) {
        return { block: true, reason: `Blocked by bash-guard: ${reason}. Use a read-only check, repo patch, or user-operated command instead.` };
      }
    }
  });
}
