// Fetch public customer-language pages into <workspace>/evidence/sources/S<NNN>.md
// and rebuild evidence/SOURCES.md. No AI, Node built-ins only.
// Exit: 0 at least one source written this run / 1 none written / 3 bad arguments or unwritable workspace.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalDirectory, resolveWriteWithin, wordCount } from "./lib.ts";

const USER_AGENT = "synthetic-customer-panel-kit fetch-evidence (public evidence collector)";
const TIMEOUT_MS = 20_000;
// header/footer are kept: inside an <article> they hold the customer's own words, and telling page chrome apart needs a parser.
const DROP_TAGS = ["script", "style", "nav", "noscript"];
const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|blockquote|pre|hr|dd|dt|main|aside)\b[^>]*>/gi;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (!lower.startsWith("#")) return whole;
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    // An invalid code point becomes U+FFFD, as browsers do, instead of throwing and aborting the run.
    if (!(code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return "�";
    return String.fromCodePoint(code);
  });
}

function collapse(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? collapse(decode(titleMatch[1])).replace(/\n/g, " ") || null : null;
  let body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<head\b[\s\S]*?<\/head>/i, "");
  for (const tag of DROP_TAGS) {
    body = body.replace(new RegExp(`<${tag}[\\s>/][\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
  }
  body = body.replace(BLOCK_TAGS, "\n").replace(/<[^>]+>/g, "");
  return { title, text: collapse(decode(body)) };
}

async function nextId(sourcesDir: string): Promise<number> {
  let highest = 0;
  for (const name of await readdir(sourcesDir)) {
    const match = name.match(/^S(\d+)\.md$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

function header(source: string, key: string): string {
  return source.match(new RegExp(`^${key}: (.*)$`, "m"))?.[1] ?? "";
}

async function fetchOne(url: string): Promise<{ title: string; text: string } | { skipped: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const type = contentType.split(";")[0].trim().toLowerCase();
  const charset = contentType.match(/;\s*charset\s*=\s*"?([^";\s]+)/i)?.[1];
  const bytes = await response.arrayBuffer();
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset ?? "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8"); // unsupported charset label
  }
  const body = decoder.decode(bytes);
  if (type === "text/html" || type === "application/xhtml+xml") {
    const { title, text } = htmlToText(body);
    return { title: title ?? url, text };
  }
  if (type === "text/plain" || type === "text/markdown" || type === "text/x-markdown") {
    return { title: url, text: body.trim() };
  }
  return { skipped: type || "unknown" };
}

async function main(): Promise<number> {
  const [workspaceArg, listArg, ...extra] = process.argv.slice(2);
  if (!workspaceArg || !listArg || extra.length > 0) {
    console.error("usage: node fetch-evidence.ts <workspace> <url-list-file>");
    return 3;
  }
  let workspace: string;
  let sourcesDir: string;
  let urls: string[];
  try {
    workspace = await canonicalDirectory(workspaceArg, "workspace");
    urls = (await readFile(listArg, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    sourcesDir = await resolveWriteWithin(workspace, "evidence/sources");
    await mkdir(sourcesDir, { recursive: true });
  } catch (error) {
    console.error(`fetch-evidence: ${error instanceof Error ? error.message : String(error)}`);
    return 3;
  }

  const failed: Array<{ url: string; reason: string }> = [];
  let written = 0;
  let id = await nextId(sourcesDir);
  const fetched = new Date().toISOString().slice(0, 10);
  for (const url of urls) {
    // One bad source (fetch, conversion or write) is recorded and never aborts the run or skips the index.
    try {
      const result = await fetchOne(url);
      if ("skipped" in result) {
        failed.push({ url, reason: `skipped: ${result.skipped}` });
        console.log(`SKIPPED ${url}: ${result.skipped}`);
        continue;
      }
      const sourceId = `S${String(id).padStart(3, "0")}`;
      const path = await resolveWriteWithin(workspace, `evidence/sources/${sourceId}.md`);
      const words = wordCount(result.text);
      const content = [`id: ${sourceId}`, `title: ${result.title}`, `url: ${url}`, `fetched: ${fetched}`, `words: ${words}`, "", "---", "", result.text, ""].join("\n");
      await writeFile(path, content, { flag: "wx" });
      console.log(`WROTE ${sourceId} ${url} (${words} words)`);
      written += 1;
      id += 1;
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : error instanceof Error ? error.message : String(error);
      failed.push({ url, reason });
      console.log(`FAILED ${url}: ${reason}`);
    }
  }

  const rows: string[] = [];
  for (const name of (await readdir(sourcesDir)).filter((entry) => /^S\d+\.md$/.test(entry)).sort((a, b) => Number(a.slice(1, -3)) - Number(b.slice(1, -3)))) {
    const source = await readFile(join(sourcesDir, name), "utf8");
    const cell = (key: string) => header(source, key).replace(/\|/g, "\\|");
    rows.push(`| ${cell("id")} | ${cell("title")} | ${cell("url")} | ${cell("fetched")} | ${cell("words")} |`);
  }
  const index = [
    "# Sources",
    "",
    "Public pages fetched by `scripts/fetch-evidence.ts`. Cite a source by id (`S003`) with a verbatim quote.",
    "",
    "| id | title | url | fetched | words |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Failed",
    "",
    ...(failed.length ? failed.map((entry) => `- ${entry.url}: ${entry.reason}`) : ["- none this run"]),
    "",
  ].join("\n");
  await writeFile(await resolveWriteWithin(workspace, "evidence/SOURCES.md"), index);
  console.log(`${written} written, ${failed.length} failed`);
  return written > 0 ? 0 : 1;
}

// A failure outside the per-source loop (SOURCES.md write, unreadable sources dir) is a harness error.
process.exitCode = await main().catch((error: unknown) => {
  console.error(`fetch-evidence: ${error instanceof Error ? error.message : String(error)}`);
  return 3;
});
