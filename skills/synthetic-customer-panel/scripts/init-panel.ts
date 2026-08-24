import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalDirectory, resolveWriteWithin, slugify } from "./lib.ts";

interface Args {
  ownedRoot: string;
  target: string;
  name: string;
  id: string;
}

function usage(): never {
  console.error(
    'usage: node init-panel.ts --owned-root <directory> <target> --name "<panel name>" [--id <panel-id>]',
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  let target = "";
  let ownedRoot = "";
  let name = "";
  let id = "";
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--owned-root") {
      ownedRoot = argv[index + 1] || "";
      index += 1;
    } else if (value === "--name") {
      name = argv[index + 1] || "";
      index += 1;
    } else if (value === "--id") {
      id = argv[index + 1] || "";
      index += 1;
    } else if (!value.startsWith("--") && !target) {
      target = value;
    } else {
      usage();
    }
  }
  if (!target || !ownedRoot || !name.trim()) {
    usage();
  }
  return {
    ownedRoot: resolve(ownedRoot),
    target: resolve(target),
    name: name.trim(),
    id: id.trim() || slugify(name),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function canonicalizeProspectivePath(path: string): Promise<string> {
  const missingSegments: string[] = [];
  let ancestor = resolve(path);
  while (!(await pathExists(ancestor))) {
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new Error("target has no existing ancestor");
    }
    missingSegments.unshift(basename(ancestor));
    ancestor = parent;
  }
  return resolve(
    await canonicalDirectory(ancestor, "target ancestor"),
    ...missingSegments,
  );
}

async function replaceTokens(
  path: string,
  values: Record<string, string>,
): Promise<void> {
  let text = await readFile(path, "utf8");
  for (const [token, value] of Object.entries(values)) {
    text = text.replaceAll(token, value);
  }
  await writeFile(path, text, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ownedRoot = await canonicalDirectory(args.ownedRoot, "owned root");
  const targetCandidate = await canonicalizeProspectivePath(args.target);
  const target = await resolveWriteWithin(ownedRoot, relative(ownedRoot, targetCandidate));
  if (await pathExists(target)) {
    throw new Error(
      `target already exists; choose a new owned workspace: ${target}`,
    );
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const template = resolve(scriptDir, "..", "assets", "workspace-template");
  await mkdir(dirname(target), { recursive: true });
  await cp(template, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });

  const createdAt = new Date().toISOString().slice(0, 10);
  const tokens = {
    __PANEL_ID__: args.id,
    __PANEL_NAME__: args.name,
    __CREATED_AT__: createdAt,
  };
  await replaceTokens(join(target, "panel.json"), tokens);
  await replaceTokens(join(target, "PANEL-BRIEF.md"), tokens);

  console.log(`initialized draft panel: ${target}`);
  console.log(`manifest: ${join(target, "panel.json")}`);
  console.log(
    "next: fill the brief, evidence, owner context, roster, dossiers, and scoring",
  );
  console.log("then run validate-panel.ts without --allow-draft");
}

main().catch((error: unknown) => {
  console.error(
    `init-panel failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
