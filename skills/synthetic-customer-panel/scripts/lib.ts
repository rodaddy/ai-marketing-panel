import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  path?: string;
}

export type SeatKind = "buyer" | "user" | "influencer" | "specialist";
export type SeatFit = "core" | "adjacent" | "wrong-fit" | "hard-no";

export interface PanelSeat {
  id: string;
  name: string;
  kind: SeatKind;
  fit: SeatFit;
  dossier: string;
  decision_signal: string;
  active: boolean;
}

export interface ScoreDimension {
  id: string;
  label: string;
  weight: number;
}

export interface PanelManifest {
  schema_version: number;
  panel: {
    id: string;
    name: string;
    objective: string;
    decision_signal: string;
    artifact_types: string[];
    status: "draft" | "ready";
    created_at: string;
    review_due: string;
    owner_context: string;
    evidence_index: string;
    calibration_outcome: string;
    calibration_horizon: string;
  };
  execution: {
    preferred_mode:
      | "isolated-parallel"
      | "isolated-sequential"
      | "sequential-shared-context";
    max_parallel_per_wave: number;
  };
  scoring: { dimensions: ScoreDimension[] };
  seats: PanelSeat[];
}

export interface PanelValidation {
  workspace: string | null;
  manifest: PanelManifest | null;
  issues: ValidationIssue[];
  activeSeats: PanelSeat[];
}

export const REQUIRED_DOSSIER_HEADINGS = [
  "Panel role",
  "Evidence basis",
  "Demographics and context",
  "Professional or life background",
  "Primary goals and motivations",
  "Secondary goals",
  "Pain points",
  "Emotional frustrations",
  "Empathy map",
  "Channels and content habits",
  "Decision-making process",
  "Buying or action history",
  "Voice notes",
  "Boundaries and likely no",
  "Modeled assumptions",
] as const;

const PANEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_KINDS = new Set<SeatKind>([
  "buyer",
  "user",
  "influencer",
  "specialist",
]);
const ALLOWED_FITS = new Set<SeatFit>([
  "core",
  "adjacent",
  "wrong-fit",
  "hard-no",
]);
const PLACEHOLDER =
  /__PANEL|Replace with|Set an evidence|<source|<Composite|<seat-id>|<date>|<panel/i;
const DOSSIER_SIMILARITY_LIMIT = 0.82;
const MIN_SECTION_WORDS = 25;
const MIN_LABEL_LENGTH = 12;

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "panel";
}

export function isoStamp(date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function wordCount(markdown: string): number {
  return markdown
    .replace(/^---[\s\S]*?---/m, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\x60#>*_[\]()|~-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return !(
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  );
}

function relativeCandidate(root: string, candidate: string): string {
  if (!candidate || isAbsolute(candidate)) {
    throw new Error("path must be a non-empty relative path");
  }
  const full = resolve(root, candidate);
  if (!isWithin(root, full)) {
    throw new Error("path escapes the panel workspace");
  }
  return full;
}

/** Resolve a real workspace directory before trusting any child path. */
export async function canonicalDirectory(path: string, label: string): Promise<string> {
  const resolved = resolve(path);
  let info;
  try {
    info = await stat(resolved);
  } catch (error) {
    throw new Error(
      `${label} is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!info.isDirectory()) {
    throw new Error(`${label} must be a directory`);
  }
  return realpath(resolved);
}

/** Read only an existing path whose resolved target remains inside root. */
export async function resolveReadWithin(root: string, candidate: string): Promise<string> {
  const full = relativeCandidate(root, candidate);
  let canonical: string;
  try {
    canonical = await realpath(full);
  } catch (error) {
    throw new Error(
      `path is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isWithin(root, canonical)) {
    throw new Error("path escapes the panel workspace through a symlink");
  }
  return canonical;
}

/**
 * Resolve a prospective write while checking every existing ancestor after
 * symlink resolution. The caller may create the returned final path.
 */
export async function resolveWriteWithin(root: string, candidate: string): Promise<string> {
  const full = relativeCandidate(root, candidate);
  let ancestor = full;
  while (true) {
    try {
      const canonicalAncestor = await realpath(ancestor);
      if (!isWithin(root, canonicalAncestor)) {
        throw new Error("path escapes the panel workspace through a symlink");
      }
      break;
    } catch (error) {
      if (error instanceof Error && error.message.includes("escapes the panel")) {
        throw error;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor || !isWithin(root, parent)) {
        throw new Error("path has no existing ancestor inside the panel workspace");
      }
      ancestor = parent;
    }
  }
  return full;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

export async function readUtf8(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function loadManifest(workspace: string): Promise<PanelManifest> {
  const manifestPath = await resolveReadWithin(workspace, "panel.json");
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw new Error(
      `cannot read panel.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return JSON.parse(raw) as PanelManifest;
  } catch (error) {
    throw new Error(
      `invalid JSON in panel.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function add(
  issues: ValidationIssue[],
  severity: IssueSeverity,
  code: string,
  message: string,
  path?: string,
): void {
  issues.push({ severity, code, message, path });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readinessSeverity(allowDraft: boolean): IssueSeverity {
  return allowDraft ? "warning" : "error";
}

function requiredString(
  issues: ValidationIssue[],
  value: unknown,
  field: string,
  allowDraft: boolean,
): void {
  const severity = readinessSeverity(allowDraft);
  if (typeof value !== "string" || value.trim().length === 0) {
    add(issues, severity, "missing-field", `${field} must be a non-empty string`);
    return;
  }
  if (PLACEHOLDER.test(value)) {
    add(issues, severity, "placeholder", `${field} still contains template text`);
  }
}

async function validateSupportFile(
  workspace: string,
  candidate: unknown,
  field: string,
  issues: ValidationIssue[],
  allowDraft: boolean,
): Promise<void> {
  const severity = readinessSeverity(allowDraft);
  if (typeof candidate !== "string") {
    add(issues, severity, "missing-support-file", `${field} path is missing`);
    return;
  }
  let path: string;
  try {
    path = await resolveReadWithin(workspace, candidate);
  } catch (error) {
    add(issues, "error", "unsafe-path", `${field}: ${error instanceof Error ? error.message : String(error)}`, candidate);
    return;
  }
  if (!(await fileExists(path))) {
    add(issues, severity, "missing-support-file", `${field} file is missing`, candidate);
    return;
  }
  const text = await readUtf8(path);
  if (!allowDraft && PLACEHOLDER.test(text)) {
    add(issues, "error", "placeholder", `${field} still contains template text`, candidate);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionText(text: string, heading: string): string | null {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = headingPattern.exec(text);
  if (!match || match.index === undefined) {
    return null;
  }
  const afterHeading = text.slice(match.index + match[0].length);
  return afterHeading.split(/^##\s+/m, 1)[0].trim();
}

function vocabulary(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9'-]*/g)
      ?.filter((word) => word.length >= 3) ?? [],
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const word of left) {
    if (right.has(word)) {
      overlap += 1;
    }
  }
  return overlap / union.size;
}

function hasSubstantiveLabeledLine(text: string, label: string): boolean {
  const pattern = new RegExp(`^-\\s*${label}:\\s*(.+?)\\s+—\\s+(.+)$`, "gim");
  for (const match of text.matchAll(pattern)) {
    if (match[1].trim().length >= MIN_LABEL_LENGTH && match[2].trim().length >= MIN_LABEL_LENGTH) {
      return true;
    }
  }
  return false;
}

async function validateDossier(
  workspace: string,
  seat: Record<string, unknown>,
  issues: ValidationIssue[],
  allowDraft: boolean,
): Promise<{ path: string; vocabulary: Set<string> } | null> {
  const severity = readinessSeverity(allowDraft);
  const seatId = typeof seat.id === "string" ? seat.id : "(missing id)";
  const candidate = seat.dossier;
  if (typeof candidate !== "string" || !candidate.startsWith("dossiers/")) {
    add(issues, "error", "dossier-boundary", `seat ${seatId} dossier must be under dossiers/`, typeof candidate === "string" ? candidate : undefined);
    return null;
  }
  let dossierPath: string;
  try {
    dossierPath = await resolveReadWithin(workspace, candidate);
  } catch (error) {
    add(issues, "error", "unsafe-path", `seat ${seatId}: ${error instanceof Error ? error.message : String(error)}`, candidate);
    return null;
  }
  if (!(await fileExists(dossierPath))) {
    add(issues, severity, "missing-dossier", `seat ${seatId} dossier is missing`, candidate);
    return null;
  }
  const text = await readUtf8(dossierPath);
  const words = wordCount(text);
  if (words < 900) {
    add(issues, severity, "dossier-too-short", `seat ${seatId} dossier has ${words} words; minimum is 900`, candidate);
  } else if (words < 1200 || words > 1800) {
    add(issues, "warning", "dossier-target", `seat ${seatId} dossier has ${words} words; target is 1200-1800`, candidate);
  }
  for (const heading of REQUIRED_DOSSIER_HEADINGS) {
    const section = sectionText(text, heading);
    if (section === null) {
      add(issues, severity, "missing-dossier-heading", `seat ${seatId} is missing "## ${heading}"`, candidate);
      continue;
    }
    const sectionWords = wordCount(section);
    if (sectionWords < MIN_SECTION_WORDS) {
      add(issues, severity, "dossier-section-substance", `seat ${seatId} section "${heading}" has ${sectionWords} words; minimum is ${MIN_SECTION_WORDS}`, candidate);
    }
    const terms = vocabulary(section);
    if (sectionWords >= MIN_SECTION_WORDS && terms.size / sectionWords < 0.2) {
      add(issues, severity, "dossier-filler", `seat ${seatId} section "${heading}" repeats too little vocabulary to be substantive`, candidate);
    }
  }
  const evidenceBasis = sectionText(text, "Evidence basis") ?? "";
  const assumptions = sectionText(text, "Modeled assumptions") ?? "";
  if (!hasSubstantiveLabeledLine(evidenceBasis, "Evidence")) {
    add(issues, severity, "dossier-evidence-label", `seat ${seatId} needs a substantive "- Evidence: label — support" line`, candidate);
  }
  if (!hasSubstantiveLabeledLine(assumptions, "Assumption")) {
    add(issues, severity, "dossier-assumption-label", `seat ${seatId} needs a substantive "- Assumption: label — test" line`, candidate);
  }
  if (!allowDraft && PLACEHOLDER.test(text)) {
    add(issues, "error", "placeholder", `seat ${seatId} dossier still contains template text`, candidate);
  }
  return { path: dossierPath, vocabulary: vocabulary(text) };
}

export async function validatePanel(
  workspaceInput: string,
  options: { allowDraft?: boolean } = {},
): Promise<PanelValidation> {
  const allowDraft = options.allowDraft === true;
  const issues: ValidationIssue[] = [];
  let workspace: string;
  try {
    workspace = await canonicalDirectory(workspaceInput, "panel workspace");
  } catch (error) {
    add(issues, "error", "workspace", error instanceof Error ? error.message : String(error), workspaceInput);
    return { workspace: null, manifest: null, issues, activeSeats: [] };
  }

  let manifest: PanelManifest;
  try {
    manifest = await loadManifest(workspace);
  } catch (error) {
    add(issues, "error", "manifest", error instanceof Error ? error.message : String(error), "panel.json");
    return { workspace, manifest: null, issues, activeSeats: [] };
  }
  if (!isRecord(manifest)) {
    add(issues, "error", "manifest-shape", "panel.json must contain an object", "panel.json");
    return { workspace, manifest: null, issues, activeSeats: [] };
  }
  if (manifest.schema_version !== 1) {
    add(issues, "error", "schema-version", "schema_version must equal 1", "panel.json");
  }
  if (!isRecord(manifest.panel)) {
    add(issues, "error", "panel-object", "panel object is missing", "panel.json");
    return { workspace, manifest, issues, activeSeats: [] };
  }
  const panel = manifest.panel;
  if (!PANEL_ID.test(typeof panel.id === "string" ? panel.id : "")) {
    add(issues, "error", "panel-id", "panel.id must use lowercase letters, digits, and hyphens", "panel.json");
  }
  for (const field of ["name", "objective", "decision_signal", "calibration_outcome", "calibration_horizon", "review_due"] as const) {
    requiredString(issues, panel[field], `panel.${field}`, allowDraft);
  }
  if (!Array.isArray(panel.artifact_types) || panel.artifact_types.length === 0) {
    add(issues, readinessSeverity(allowDraft), "artifact-types", "panel.artifact_types must contain at least one artifact type", "panel.json");
  }
  if (panel.status !== "ready") {
    add(issues, readinessSeverity(allowDraft), "panel-not-ready", 'panel.status must be "ready" before a real wash', "panel.json");
  }
  await validateSupportFile(workspace, panel.owner_context, "panel.owner_context", issues, allowDraft);
  await validateSupportFile(workspace, panel.evidence_index, "panel.evidence_index", issues, allowDraft);

  if (!isRecord(manifest.execution)) {
    add(issues, "error", "execution", "execution object is missing", "panel.json");
  } else {
    const allowedModes = new Set(["isolated-parallel", "isolated-sequential", "sequential-shared-context"]);
    if (!allowedModes.has(manifest.execution.preferred_mode)) {
      add(issues, "error", "execution-mode", "execution.preferred_mode is invalid", "panel.json");
    }
    const wave = manifest.execution.max_parallel_per_wave;
    if (!Number.isInteger(wave) || wave < 1 || wave > 7) {
      add(issues, "error", "wave-size", "execution.max_parallel_per_wave must be an integer from 1 to 7", "panel.json");
    }
  }

  const seats: unknown[] = Array.isArray(manifest.seats) ? manifest.seats : [];
  if (!Array.isArray(manifest.seats)) {
    add(issues, "error", "seats", "seats must be an array", "panel.json");
  }
  const activeSeats = seats.filter((seat): seat is PanelSeat => isRecord(seat) && seat.active === true) as PanelSeat[];
  if (activeSeats.length < 5 || activeSeats.length > 15) {
    add(issues, readinessSeverity(allowDraft), "seat-count", `active seat count is ${activeSeats.length}; expected 5-15`, "panel.json");
  }

  const seenIds = new Set<string>();
  const dossierPaths = new Map<string, string>();
  const dossierBodies: Array<{ seatId: string; path: string; vocabulary: Set<string> }> = [];
  for (const seat of seats) {
    if (!isRecord(seat)) {
      add(issues, "error", "seat-shape", "every seat must be an object", "panel.json");
      continue;
    }
    const seatId = typeof seat.id === "string" ? seat.id : "";
    if (!PANEL_ID.test(seatId)) {
      add(issues, "error", "seat-id", `invalid seat id "${seatId}"`, "panel.json");
    } else if (seenIds.has(seatId)) {
      add(issues, "error", "duplicate-seat", `duplicate seat id "${seatId}"`, "panel.json");
    }
    seenIds.add(seatId);
    if (typeof seat.name !== "string" || seat.name.trim().length === 0) {
      add(issues, "error", "seat-name", `seat ${seatId} name is missing`, "panel.json");
    }
    if (!ALLOWED_KINDS.has(seat.kind as SeatKind)) {
      add(issues, "error", "seat-kind", `seat ${seatId} kind is invalid`, "panel.json");
    }
    if (!ALLOWED_FITS.has(seat.fit as SeatFit)) {
      add(issues, "error", "seat-fit", `seat ${seatId} fit is invalid`, "panel.json");
    }
    if (typeof seat.active !== "boolean") {
      add(issues, "error", "seat-active", `seat ${seatId} active must be boolean`, "panel.json");
    }
    if (seat.active === true) {
      requiredString(issues, seat.decision_signal, `seat ${seatId} decision_signal`, allowDraft);
      const dossier = await validateDossier(workspace, seat, issues, allowDraft);
      if (dossier) {
        const existingSeat = dossierPaths.get(dossier.path);
        if (existingSeat) {
          add(issues, "error", "duplicate-dossier", `active seats ${existingSeat} and ${seatId} resolve to the same dossier`, typeof seat.dossier === "string" ? seat.dossier : undefined);
        } else {
          dossierPaths.set(dossier.path, seatId);
          dossierBodies.push({ seatId, ...dossier });
        }
      }
    }
  }
  for (let index = 0; index < dossierBodies.length; index += 1) {
    for (let other = index + 1; other < dossierBodies.length; other += 1) {
      const similarity = jaccard(dossierBodies[index].vocabulary, dossierBodies[other].vocabulary);
      if (similarity >= DOSSIER_SIMILARITY_LIMIT) {
        add(issues, readinessSeverity(allowDraft), "dossier-similarity", `seats ${dossierBodies[index].seatId} and ${dossierBodies[other].seatId} have ${(similarity * 100).toFixed(0)}% vocabulary overlap; distinguish their modeled evidence and assumptions`, dossierBodies[other].path);
      }
    }
  }

  if (!activeSeats.some((seat) => seat.fit === "core")) {
    add(issues, readinessSeverity(allowDraft), "missing-core-seat", "at least one active core seat is required", "panel.json");
  }
  if (!activeSeats.some((seat) => seat.fit === "wrong-fit" || seat.fit === "hard-no")) {
    add(issues, readinessSeverity(allowDraft), "missing-dissent-seat", "at least one active wrong-fit or hard-no seat is required", "panel.json");
  }

  const dimensions: unknown[] = isRecord(manifest.scoring) && Array.isArray(manifest.scoring.dimensions) ? manifest.scoring.dimensions : [];
  if (dimensions.length < 3 || dimensions.length > 8) {
    add(issues, readinessSeverity(allowDraft), "scoring-dimensions", `scoring dimension count is ${dimensions.length}; expected 3-8`, "panel.json");
  }
  const dimensionIds = new Set<string>();
  let weightTotal = 0;
  for (const dimension of dimensions) {
    if (!isRecord(dimension)) {
      add(issues, "error", "dimension-shape", "every scoring dimension must be an object", "panel.json");
      continue;
    }
    const dimensionId = typeof dimension.id === "string" ? dimension.id : "";
    if (!PANEL_ID.test(dimensionId)) {
      add(issues, "error", "dimension-id", `invalid scoring dimension id "${dimensionId}"`, "panel.json");
    } else if (dimensionIds.has(dimensionId)) {
      add(issues, "error", "duplicate-dimension", `duplicate scoring dimension "${dimensionId}"`, "panel.json");
    }
    dimensionIds.add(dimensionId);
    if (typeof dimension.label !== "string" || dimension.label.trim().length === 0) {
      add(issues, "error", "dimension-label", `dimension ${dimensionId} label is missing`, "panel.json");
    }
    if (typeof dimension.weight !== "number" || !Number.isFinite(dimension.weight) || dimension.weight <= 0) {
      add(issues, "error", "dimension-weight", `dimension ${dimensionId} weight must be positive`, "panel.json");
    } else {
      weightTotal += dimension.weight;
    }
  }
  if (dimensions.length > 0 && Math.abs(weightTotal - 100) > 0.001) {
    add(issues, readinessSeverity(allowDraft), "scoring-total", `scoring weights total ${weightTotal}; expected 100`, "panel.json");
  }
  return { workspace, manifest, issues, activeSeats };
}

export function formatIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return "PASS: no validation issues";
  }
  return issues.map((issue) => {
    const location = issue.path ? ` [${issue.path}]` : "";
    return `${issue.severity.toUpperCase()} ${issue.code}${location}: ${issue.message}`;
  }).join("\n");
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
