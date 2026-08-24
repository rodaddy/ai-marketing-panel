import { resolve } from "node:path";

import { formatIssues, hasErrors, validatePanel } from "./lib.ts";

function usage(): never {
  console.error("usage: node validate-panel.ts <workspace> [--allow-draft]");
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const allowDraft = argv.includes("--allow-draft");
  const positional = argv.filter((value) => value !== "--allow-draft");
  if (positional.length !== 1) {
    usage();
  }

  const workspace = resolve(positional[0]);
  const result = await validatePanel(workspace, { allowDraft });
  console.log(formatIssues(result.issues));
  console.log(
    `panel: ${result.manifest?.panel?.id || "unavailable"}; active seats: ${result.activeSeats.length}`,
  );

  if (hasErrors(result.issues)) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    `validate-panel failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
