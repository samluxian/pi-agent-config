import { realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

function findPiPackageRoot() {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    try {
      const entry = realpathSync(join(dir, process.platform === "win32" ? "pi.cmd" : "pi"));
      return dirname(dirname(entry));
    } catch {
      // Continue to the next PATH entry.
    }
  }
  throw new Error("Cannot run subagent tests: pi executable not found in PATH");
}

const piPackageParent = pathToFileURL(join(findPiPackageRoot(), "dist", "index.js")).href;
const piRuntimePackages = new Set([
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (piRuntimePackages.has(specifier)) {
      return nextResolve(specifier, { ...context, parentURL: piPackageParent });
    }
    return nextResolve(specifier, context);
  },
});
