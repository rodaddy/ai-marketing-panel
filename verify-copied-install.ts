import { lstat, readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const SOURCE_PAYLOAD = resolve(import.meta.dirname, "skills", "synthetic-customer-panel");

function usage(): never {
  console.error("usage: node verify-copied-install.ts <copied-destination>");
  process.exit(2);
}

function fail(code: string, message: string): never {
  console.error(`ERROR ${code}: ${message}`);
  process.exit(1);
}

function portablePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

async function listPayloadFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = resolve(directory, entry.name);
    const path = portablePath(root, full);
    if (entry.isSymbolicLink()) {
      fail("copied-install-unsafe-entry", `payload contains a symlink: ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listPayloadFiles(root, full)));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      fail("copied-install-unsafe-entry", `payload contains a non-file entry: ${path}`);
    }
  }
  return files;
}

async function requireDirectory(path: string, label: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      fail("copied-install-unsafe-root", `${label} must be a non-symlink directory: ${path}`);
    }
  } catch (error) {
    fail("copied-install-missing", `${label} is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function samePaths(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

async function main(): Promise<void> {
  const [destinationArgument, ...extra] = process.argv.slice(2);
  if (!destinationArgument || extra.length > 0) usage();

  const destination = resolve(destinationArgument);
  await requireDirectory(SOURCE_PAYLOAD, "source payload");
  await requireDirectory(destination, "copied destination");

  const [sourceFiles, destinationFiles] = await Promise.all([
    listPayloadFiles(SOURCE_PAYLOAD),
    listPayloadFiles(destination),
  ]);
  const expected = sourceFiles.sort();
  const actual = destinationFiles.sort();
  if (!samePaths(expected, actual)) {
    const extras = actual.filter((path) => !expected.includes(path));
    const missing = expected.filter((path) => !actual.includes(path));
    if (extras.length > 0) {
      fail("copied-install-extras", `copied destination has extra file(s): ${extras.join(", ")}`);
    }
    fail("copied-install-missing", `copied destination is missing file(s): ${missing.join(", ")}`);
  }

  for (const path of expected) {
    const [source, installed] = await Promise.all([
      readFile(resolve(SOURCE_PAYLOAD, path)),
      readFile(resolve(destination, path)),
    ]);
    if (source.length !== installed.length || !source.every((byte, index) => byte === installed[index])) {
      fail("copied-install-mismatch", path);
    }
  }

  console.log(`PASS copied-install equality verified: ${SOURCE_PAYLOAD} == ${destination}`);
}

main().catch((error: unknown) => {
  fail("verify-copied-install", error instanceof Error ? error.message : String(error));
});
