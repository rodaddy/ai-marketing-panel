// Shared run loading for render-report.ts. Deterministic: no AI, no network.
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { fileExists, isActiveSeat, pickAvatars } from "./lib.ts";

export type Rec = Record<string, any>;
export type Fields = Map<string, string>;

const SKILL_ROOT = resolve(import.meta.dirname, "..");
export const AVATARS = join(SKILL_ROOT, "assets", "avatars");

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function dataUri(path: string): Promise<string> {
  return `data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`;
}

export const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

export function parseReaction(text: string): Fields {
  const fields: Fields = new Map();
  let last = "";
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_]+):\s?(.*)$/.exec(line);
    if (match) {
      last = match[1];
      fields.set(last, match[2]);
    } else if (last && line.trim()) {
      fields.set(last, `${fields.get(last)} ${line.trim()}`);
    }
  }
  return fields;
}

export function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim();
}

// Parses `<run-dir> [--out <file>]`; the default output is <run-dir>/<defaultName>.
export function parseArgs(script: string, defaultName: string): { runDir: string; out: string } {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  const usage = (): never => {
    console.error(`usage: node ${script} <run-dir> [--out <file>]`);
    process.exit(2);
  };
  if (outIndex >= 0 && !argv[outIndex + 1]) usage();
  const positional = argv.filter((_, index) => outIndex < 0 || (index !== outIndex && index !== outIndex + 1));
  if (positional.length !== 1) usage();
  const runDir = resolve(positional[0]);
  return { runDir, out: outIndex >= 0 ? resolve(argv[outIndex + 1]) : join(runDir, defaultName) };
}

// validate-run calls main() on import and exports nothing, so it is spawned.
export function refuseInvalid(runDir: string, name: string): void {
  const check = spawnSync(process.execPath, [join(import.meta.dirname, "validate-run.ts"), runDir], { encoding: "utf8" });
  if (check.status !== 0) {
    console.error(`${check.stdout}${check.stderr}`.trim());
    console.error(`${name}: refused, the run fails validate-run; fix the run first.`);
    process.exit(1);
  }
}

async function readCopy(path: string, name: string): Promise<Rec | null> {
  if (!(await fileExists(path))) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as Rec;
  } catch {
    console.error(`${name}: warning, REPORT-COPY.json is not valid JSON; ignored.`);
    return null;
  }
}

export interface Run {
  snapshot: Rec;
  outcome: Rec;
  copy: Rec | null;
  seats: Rec[];
  reactions: Map<string, Fields>;
  imageFor: (seatId: string) => Promise<[string, string]>;
  heroPath: string;
}

export async function loadRun(runDir: string, name: string): Promise<Run> {
  const snapshot = JSON.parse(await readFile(join(runDir, "panel-snapshot.json"), "utf8")) as Rec;
  const outcome = JSON.parse(await readFile(join(runDir, "OUTCOME.json"), "utf8")) as Rec;
  const copy = await readCopy(join(runDir, "REPORT-COPY.json"), name);
  const seats = (snapshot.seats as Rec[]).filter(isActiveSeat);
  const reactions = new Map<string, Fields>();
  for (const seat of seats) {
    const path = join(runDir, "reactions", `${seat.id}.md`);
    if (await fileExists(path)) reactions.set(seat.id, parseReaction(await readFile(path, "utf8")));
  }

  const imgDir = join(runDir, "report-img");
  const files = (await readdir(AVATARS)).filter((file) => /^(avatar|robot)-\d+\.jpg$/.test(file)).sort();
  let meta: Array<{ file: string; kind?: string; gender?: string; age_band?: string }>;
  try {
    meta = JSON.parse(await readFile(join(AVATARS, "avatars.json"), "utf8"));
    if (!Array.isArray(meta)) throw new Error("not an array");
  } catch {
    console.error(`${name}: assets/avatars/avatars.json missing or invalid; reinstall the kit`);
    process.exit(1);
  }
  let defaults: Map<string, string>;
  try {
    // A seat with its own report-img photo never needs a default face, so it does not use one up.
    const photoless: Rec[] = [];
    for (const seat of seats) if (!(await fileExists(join(imgDir, `${seat.id}.jpg`)))) photoless.push(seat);
    defaults = pickAvatars(photoless as Array<{ id: string; kind?: unknown; avatar?: unknown }>, files, meta);
  } catch (error) {
    console.error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const imageFor = async (seatId: string): Promise<[string, string]> => {
    const photo = join(imgDir, `${seatId}.jpg`);
    if (await fileExists(photo)) return [`report-img/${seatId}.jpg`, await dataUri(photo)];
    const file = defaults.get(seatId) ?? files[0];
    return [file, await dataUri(join(AVATARS, file))];
  };
  const heroPath = (await fileExists(join(imgDir, "hero.jpg"))) ? join(imgDir, "hero.jpg") : join(AVATARS, "hero-01.jpg");
  return { snapshot, outcome, copy, seats, reactions, imageFor, heroPath };
}

// A copy quote is shown only when the seat's own reaction holds it verbatim.
export function quoteFor(copy: Rec | null, seatId: string, fields: Fields | undefined): string {
  const copyQuote = copy?.seats?.[seatId]?.quote;
  const quoteOk = typeof copyQuote === "string" && squash(copyQuote) !== "" && !!fields && [...fields.values()].some((value) => squash(value).includes(squash(copyQuote)));
  return quoteOk ? copyQuote : fields ? firstSentence(fields.get("LANDS") ?? "") : "This seat returned no reaction in this run.";
}
