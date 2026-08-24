import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const KIT_ID = "synthetic-customer-panel";
const VERSION = "1.2.3";
const METADATA_SHA256 = "6831e277f8628439f5375a4ce36627f280d149b15220db78d1c5b9ad33b5037b";
const ROOT = resolve(import.meta.dirname, "..");
const METADATA_PATH = resolve(ROOT, "KIT-METADATA.json");
const EXEMPT_FILES = new Set(["KIT-METADATA.json", "scripts/verify-install.ts"]);

interface KitMetadata {
  kit_id: string;
  version: string;
  files: Record<string, string>;
}

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(code: string, message: string): never {
  console.error(`ERROR ${code}: ${message}`);
  process.exit(1);
}

function metadataPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      fail("unsafe-entry", `installed payload contains a symlink: ${metadataPath(full)}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(metadataPath(full));
    } else {
      fail("unsafe-entry", `installed payload contains a non-file entry: ${metadataPath(full)}`);
    }
  }
  return files;
}

function parseMetadata(bytes: Uint8Array): KitMetadata {
  if (digest(bytes) !== METADATA_SHA256) {
    fail("metadata-integrity", "KIT-METADATA.json does not match this verifier");
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      fail("metadata-format", "KIT-METADATA.json has an invalid shape");
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.kit_id !== "string" ||
      typeof record.version !== "string" ||
      typeof record.files !== "object" ||
      record.files === null ||
      Array.isArray(record.files)
    ) {
      fail("metadata-format", "KIT-METADATA.json has an invalid shape");
    }
    return record as unknown as KitMetadata;
  } catch (error) {
    fail("metadata-format", `cannot parse KIT-METADATA.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function samePaths(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((path, index) => path === expected[index]);
}

async function main(): Promise<void> {
  const metadata = parseMetadata(await readFile(METADATA_PATH));
  if (metadata.kit_id !== KIT_ID || metadata.version !== VERSION) {
    fail("installed-identity", `expected ${KIT_ID}@${VERSION}, found ${metadata.kit_id}@${metadata.version}`);
  }

  const expectedFiles = Object.keys(metadata.files).sort();
  const actualFiles = (await listFiles(ROOT)).filter((path) => !EXEMPT_FILES.has(path)).sort();
  if (!samePaths(actualFiles, expectedFiles)) {
    fail("integrity-file-set", "installed payload files do not match KIT-METADATA.json");
  }
  for (const path of expectedFiles) {
    const expected = metadata.files[path];
    if (!/^[a-f0-9]{64}$/.test(expected)) {
      fail("metadata-format", `invalid SHA-256 for ${path}`);
    }
    const actual = digest(await readFile(resolve(ROOT, path)));
    if (actual !== expected) {
      fail("integrity-mismatch", path);
    }
  }
  console.log(`PASS ${KIT_ID}@${VERSION}: metadata and ${expectedFiles.length} non-verifier payload files match embedded expectations at ${ROOT}; verifier bytes not checked`);
}

main().catch((error: unknown) => {
  fail("verify-install", error instanceof Error ? error.message : String(error));
});
