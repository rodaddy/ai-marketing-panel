import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type { ValidationIssue } from "./lib.ts";
import {
  canonicalDirectory,
  EXECUTION_MODES,
  fileExists,
  formatIssues,
  hasErrors,
  ISOLATED_MODES,
  resolveReadWithin,
  resolveWriteWithin,
  SEAT_AGE_BANDS,
  SEAT_GENDERS,
  SHARED_CONTEXT_MODE,
  sha256File,
} from "./lib.ts";

type RecordValue = Record<string, unknown>;
type ReactionFields = Map<string, string>;
type MarkdownOutputs = Map<string, string>;

const CONFIDENCE = new Set(["LOW", "MEDIUM", "HIGH"]);
const DECISIONS = new Set(["SHIP", "REVISE", "STOP"]);
const CITABLE_FIELDS = new Set([
  "REACTION",
  "LANDS",
  "RESISTS",
  "MISSING",
  "CHANGE",
  "DECISION",
  "GATE",
]);
const DISSENT_FIELDS = new Set(["RESISTS", "MISSING", "DECISION", "GATE"]);
const PANEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const SEAT_KINDS = new Set(["buyer", "user", "influencer", "specialist"]);
const SEAT_FITS = new Set(["core", "adjacent", "wrong-fit", "hard-no"]);
const SNAPSHOT_PANEL_FIELDS = [
  "name",
  "objective",
  "decision_signal",
  "created_at",
  "review_due",
  "owner_context",
  "evidence_index",
  "calibration_outcome",
  "calibration_horizon",
] as const;
const REACTION_LABELS = [
  "SEAT_ID",
  "DECISION",
  "INTENSITY",
  "GATE",
  "CONFIDENCE",
  "REACTION",
  "LANDS",
  "RESISTS",
  "MISSING",
  "CHANGE",
] as const;
const REACTION_LABEL_SET = new Set<string>(REACTION_LABELS);
const MARKDOWN_CONTRACTS = {
  "SYNTHESIS.md": {
    markers: ["SYNTHESIS_CONFIDENCE"] as const,
    sections: ["Decision table", "Agreement clusters", "Consequential dissent", "Limitations"],
  },
  "SCORECARD.md": {
    markers: ["SCORECARD_TOTAL"] as const,
    sections: ["Dimension arithmetic", "Total"],
  },
  "RESULT.md": {
    markers: ["RESULT_DECISION", "RESULT_CONFIDENCE"] as const,
    sections: ["Evidence", "Dissent", "Limitations", "Next experiment"],
  },
} as const;

function usage(): never {
  console.error("usage: node validate-run.ts <run-folder> [--prepared]");
  process.exit(2);
}

function add(
  issues: ValidationIssue[],
  severity: "error" | "warning",
  code: string,
  message: string,
  path?: string,
): void {
  issues.push({ severity, code, message, path });
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : null;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readRunFile(runDir: string, path: string): Promise<string> {
  return resolveReadWithin(runDir, path);
}

function directRunChild(runsDir: string, runDir: string): boolean {
  const child = relative(runsDir, runDir);
  return Boolean(child) && !child.includes(sep) && child !== ".." && !child.startsWith(`..${sep}`);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
  if (!match) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.valueOf())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3])
    && date.getUTCHours() === Number(match[4])
    && date.getUTCMinutes() === Number(match[5])
    && date.getUTCSeconds() === Number(match[6]);
}

interface SnapshotSeat {
  id: string;
  kind: string;
  fit: string;
}

interface SnapshotDimension {
  id: string;
  weight: number;
}

interface SnapshotState {
  activeSeats: SnapshotSeat[];
  dimensions: SnapshotDimension[];
}

function snapshotString(
  panel: RecordValue,
  field: (typeof SNAPSHOT_PANEL_FIELDS)[number],
  issues: ValidationIssue[],
): void {
  if (typeof panel[field] !== "string" || panel[field].trim().length === 0) {
    add(issues, "error", "snapshot-panel-field", `panel.${field} must be a non-empty string`, "panel-snapshot.json");
  }
}

function validateSnapshot(snapshot: RecordValue, issues: ValidationIssue[]): SnapshotState {
  const state: SnapshotState = { activeSeats: [], dimensions: [] };
  if (snapshot.schema_version !== 1) {
    add(issues, "error", "snapshot-schema", "panel snapshot schema_version must equal 1", "panel-snapshot.json");
  }

  const panel = isRecord(snapshot.panel) ? snapshot.panel : null;
  if (!panel) {
    add(issues, "error", "snapshot-panel", "panel snapshot has no panel object", "panel-snapshot.json");
  } else {
    if (typeof panel.id !== "string" || !PANEL_ID.test(panel.id)) {
      add(issues, "error", "snapshot-panel-id", "panel.id must use lowercase letters, digits, and hyphens", "panel-snapshot.json");
    }
    for (const field of SNAPSHOT_PANEL_FIELDS) {
      snapshotString(panel, field, issues);
    }
    if (!Array.isArray(panel.artifact_types) || panel.artifact_types.length === 0 || !panel.artifact_types.every((value) => typeof value === "string" && value.trim().length > 0)) {
      add(issues, "error", "snapshot-artifact-types", "panel.artifact_types must be a non-empty string array", "panel-snapshot.json");
    }
    if (panel.status !== "ready") {
      add(issues, "error", "snapshot-panel-status", 'panel.status must be "ready"', "panel-snapshot.json");
    }
  }

  const execution = isRecord(snapshot.execution) ? snapshot.execution : null;
  if (!execution || !EXECUTION_MODES.has(execution.preferred_mode as string) || execution.preferred_mode === "unassigned" || !Number.isInteger(execution.max_parallel_per_wave) || (execution.max_parallel_per_wave as number) < 1 || (execution.max_parallel_per_wave as number) > 7) {
    add(issues, "error", "snapshot-execution", "snapshot execution must record a valid preferred mode and wave size", "panel-snapshot.json");
  }

  if (!Array.isArray(snapshot.seats)) {
    add(issues, "error", "snapshot-seats", "snapshot seats must be an array", "panel-snapshot.json");
  } else {
    const ids = new Set<string>();
    for (const seat of snapshot.seats) {
      if (!isRecord(seat)) {
        add(issues, "error", "snapshot-seat-shape", "every snapshot seat must be an object", "panel-snapshot.json");
        continue;
      }
      const id = typeof seat.id === "string" ? seat.id : "";
      const idIsValid = PANEL_ID.test(id);
      if (!idIsValid) {
        add(issues, "error", "snapshot-seat-id", `invalid snapshot seat id "${id}"`, "panel-snapshot.json");
      } else if (ids.has(id)) {
        add(issues, "error", "snapshot-seat-id", `duplicate snapshot seat id "${id}"`, "panel-snapshot.json");
      }
      ids.add(id);
      const kind = typeof seat.kind === "string" ? seat.kind : "";
      const kindIsValid = SEAT_KINDS.has(kind);
      if (!kindIsValid) {
        add(issues, "error", "snapshot-seat-kind", `seat ${id || "(missing id)"} kind is invalid`, "panel-snapshot.json");
      }
      const fit = typeof seat.fit === "string" ? seat.fit : "";
      const fitIsValid = SEAT_FITS.has(fit);
      if (!fitIsValid) {
        add(issues, "error", "snapshot-seat-fit", `seat ${id || "(missing id)"} fit is invalid`, "panel-snapshot.json");
      }
      if (typeof seat.name !== "string" || seat.name.trim().length === 0 || typeof seat.dossier !== "string" || seat.dossier.trim().length === 0) {
        add(issues, "error", "snapshot-seat-field", `seat ${id || "(missing id)"} needs name and dossier fields`, "panel-snapshot.json");
      }
      if (seat.gender !== undefined && !SEAT_GENDERS.has(seat.gender as string)) {
        add(issues, "error", "snapshot-seat-gender", `seat ${id || "(missing id)"} gender must be one of ${[...SEAT_GENDERS].join(", ")}`, "panel-snapshot.json");
      }
      if (seat.age_band !== undefined && !SEAT_AGE_BANDS.has(seat.age_band as string)) {
        add(issues, "error", "snapshot-seat-age-band", `seat ${id || "(missing id)"} age_band must be one of ${[...SEAT_AGE_BANDS].join(", ")}`, "panel-snapshot.json");
      }
      if (typeof seat.active !== "boolean") {
        add(issues, "error", "snapshot-seat-active", `seat ${id || "(missing id)"} active must be boolean`, "panel-snapshot.json");
        continue;
      }
      if (seat.active === true) {
        if (typeof seat.decision_signal !== "string" || seat.decision_signal.trim().length === 0) {
          add(issues, "error", "snapshot-decision-signal", `active seat ${id || "(missing id)"} needs a role-specific decision_signal`, "panel-snapshot.json");
        }
        if (idIsValid && kindIsValid && fitIsValid) {
          state.activeSeats.push({ id, kind, fit });
        }
      }
    }
  }
  if (state.activeSeats.length < 5 || state.activeSeats.length > 15) {
    add(issues, "error", "snapshot-seat-count", `active snapshot seat count is ${state.activeSeats.length}; expected 5-15`, "panel-snapshot.json");
  }
  if (!state.activeSeats.some((seat) => seat.fit === "core")) {
    add(issues, "error", "snapshot-core-coverage", "snapshot requires at least one active core seat", "panel-snapshot.json");
  }
  if (!state.activeSeats.some((seat) => seat.fit === "wrong-fit" || seat.fit === "hard-no")) {
    add(issues, "error", "snapshot-dissent-coverage", "snapshot requires at least one active wrong-fit or hard-no seat", "panel-snapshot.json");
  }

  const scoring = isRecord(snapshot.scoring) ? snapshot.scoring : null;
  const dimensions = scoring?.dimensions;
  if (!Array.isArray(dimensions)) {
    add(issues, "error", "snapshot-dimensions", "snapshot scoring.dimensions must be an array", "panel-snapshot.json");
  } else {
    const ids = new Set<string>();
    let total = 0;
    for (const dimension of dimensions) {
      if (!isRecord(dimension)) {
        add(issues, "error", "snapshot-dimension-shape", "every snapshot dimension must be an object", "panel-snapshot.json");
        continue;
      }
      const id = typeof dimension.id === "string" ? dimension.id : "";
      const idIsValid = PANEL_ID.test(id);
      const duplicate = idIsValid && ids.has(id);
      if (!idIsValid) {
        add(issues, "error", "snapshot-dimension-id", `invalid snapshot dimension id "${id}"`, "panel-snapshot.json");
      } else if (duplicate) {
        add(issues, "error", "snapshot-dimension-id", `duplicate snapshot dimension id "${id}"`, "panel-snapshot.json");
      }
      ids.add(id);
      if (typeof dimension.label !== "string" || dimension.label.trim().length === 0) {
        add(issues, "error", "snapshot-dimension-label", `snapshot dimension ${id || "(missing id)"} needs a label`, "panel-snapshot.json");
      }
      const weight = typeof dimension.weight === "number" && Number.isFinite(dimension.weight) && dimension.weight > 0
        ? dimension.weight
        : null;
      const weightIsValid = weight !== null;
      if (!weightIsValid) {
        add(issues, "error", "snapshot-dimension-weight", `snapshot dimension ${id || "(missing id)"} weight must be positive`, "panel-snapshot.json");
      } else {
        total += weight;
      }
      if (idIsValid && !duplicate && weightIsValid) {
        state.dimensions.push({ id, weight });
      }
    }
    if (dimensions.length < 3 || dimensions.length > 8) {
      add(issues, "error", "snapshot-dimension-count", `snapshot scoring dimension count is ${dimensions.length}; expected 3-8`, "panel-snapshot.json");
    }
    if (Math.abs(total - 100) > 0.001) {
      add(issues, "error", "snapshot-scoring-total", `snapshot scoring weights total ${total}; expected 100`, "panel-snapshot.json");
    }
  }
  return state;
}

interface PreparedState {
  expectedSeats: string[];
  snapshot: SnapshotState;
}

async function validatePrepared(
  runDir: string,
  run: RecordValue,
  snapshot: RecordValue,
  issues: ValidationIssue[],
): Promise<PreparedState> {
  if (run.schema_version !== 1) {
    add(issues, "error", "run-schema", "RUN.json schema_version must equal 1", "RUN.json");
  }
  if (!isIsoTimestamp(run.created_at)) {
    add(issues, "error", "created-at", "RUN.json created_at must be a valid ISO UTC timestamp", "RUN.json");
  }
  if (typeof run.run_id !== "string" || !RUN_ID.test(run.run_id) || run.run_id !== basename(runDir)) {
    add(issues, "error", "run-id", "RUN.json run_id must be a portable alphanumeric/hyphen string equal to the run folder basename", "RUN.json");
  }
  if (run.status === "prepared" && run.completed_at !== null) {
    add(issues, "error", "completed-at", "a prepared run must have completed_at set to null", "RUN.json");
  }
  try {
    const snapshotPath = await readRunFile(runDir, "panel-snapshot.json");
    if (typeof run.panel_snapshot_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(run.panel_snapshot_sha256)) {
      add(issues, "error", "snapshot-hash", "RUN.json panel_snapshot_sha256 must be a SHA-256 hex digest", "RUN.json");
    } else if ((await sha256File(snapshotPath)) !== run.panel_snapshot_sha256) {
      add(issues, "error", "snapshot-hash", "panel snapshot does not match RUN.json panel_snapshot_sha256", "panel-snapshot.json");
    }
  } catch (error) {
    add(issues, "error", "snapshot-hash", error instanceof Error ? error.message : String(error), "panel-snapshot.json");
  }
  const snapshotState = validateSnapshot(snapshot, issues);
  const snapshotPanel = isRecord(snapshot.panel) ? snapshot.panel : null;
  if (snapshotPanel && run.panel_id !== snapshotPanel.id) {
    add(issues, "error", "panel-id", "RUN.json panel_id does not match the panel snapshot", "RUN.json");
  }
  const expectedSeats = asStringArray(run.expected_seats);
  if (!expectedSeats || expectedSeats.length === 0 || new Set(expectedSeats).size !== expectedSeats.length || !expectedSeats.every((seatId) => PANEL_ID.test(seatId))) {
    add(issues, "error", "expected-seats", "RUN.json expected_seats must be a non-empty unique string array", "RUN.json");
    return { expectedSeats: [], snapshot: snapshotState };
  }
  const snapshotIds = snapshotState.activeSeats.map((seat) => seat.id).sort();
  if (JSON.stringify([...expectedSeats].sort()) !== JSON.stringify(snapshotIds)) {
    add(issues, "error", "snapshot-roster", "RUN.json expected seats do not match the panel snapshot", "RUN.json");
  }
  if (typeof run.artifact_file !== "string" || basename(run.artifact_file) !== run.artifact_file) {
    add(issues, "error", "artifact-path", "RUN.json artifact_file must be a simple run-local filename", "RUN.json");
  } else {
    try {
      const artifact = await readRunFile(runDir, run.artifact_file);
      if (!(await fileExists(artifact))) {
        add(issues, "error", "artifact", "artifact snapshot is missing", run.artifact_file);
      } else {
        if (run.artifact_label !== run.artifact_file) {
          add(issues, "error", "artifact-label", "RUN.json artifact_label must be the opaque artifact filename", "RUN.json");
        }
        if (typeof run.artifact_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(run.artifact_sha256)) {
          add(issues, "error", "artifact-hash", "RUN.json artifact_sha256 must be a SHA-256 hex digest", "RUN.json");
        } else if ((await sha256File(artifact)) !== run.artifact_sha256) {
          add(issues, "error", "artifact-hash", "artifact snapshot does not match RUN.json artifact_sha256", run.artifact_file);
        }
      }
    } catch (error) {
      add(issues, "error", "artifact-path", error instanceof Error ? error.message : String(error), "RUN.json");
    }
  }
  if (Object.hasOwn(run, "artifact_source")) {
    add(issues, "error", "artifact-source", "RUN.json must not persist an artifact source path", "RUN.json");
  }
  for (const path of ["SYNTHESIS-TASK.md", "OUTCOME.json"]) {
    try {
      if (!(await fileExists(await readRunFile(runDir, path)))) {
        add(issues, "error", "run-file", `${path} is missing`, path);
      }
    } catch (error) {
      add(issues, "error", "run-file", error instanceof Error ? error.message : String(error), path);
    }
  }
  for (const seatId of expectedSeats) {
    const task = join("tasks", `${seatId}.md`);
    try {
      if (!(await fileExists(await readRunFile(runDir, task)))) {
        add(issues, "error", "seat-task", `task is missing for ${seatId}`, task);
      }
    } catch (error) {
      add(issues, "error", "seat-task", error instanceof Error ? error.message : String(error), task);
    }
  }
  return { expectedSeats, snapshot: snapshotState };
}

interface FailureState {
  failed: Set<string>;
  retried: Set<string>;
}

function validateFailures(
  run: RecordValue,
  expectedSeats: string[],
  issues: ValidationIssue[],
): FailureState {
  const expected = new Set(expectedSeats);
  const failed = new Set<string>();
  const retried = new Set<string>();
  const failureEntries = Array.isArray(run.failed_seats) ? run.failed_seats : null;
  const retryEntries = Array.isArray(run.retried_seats) ? run.retried_seats : null;
  if (!failureEntries || !retryEntries) {
    add(issues, "error", "seat-events", "failed_seats and retried_seats must be arrays", "RUN.json");
    return { failed, retried };
  }
  for (const entry of retryEntries) {
    if (!isRecord(entry) || typeof entry.seat_id !== "string" || typeof entry.reason !== "string" || entry.reason.trim().length < 8 || !expected.has(entry.seat_id) || retried.has(entry.seat_id)) {
      add(issues, "error", "retry-record", "each retried seat needs one expected seat_id and a substantive reason", "RUN.json");
      continue;
    }
    retried.add(entry.seat_id);
  }
  for (const entry of failureEntries) {
    if (!isRecord(entry) || typeof entry.seat_id !== "string" || typeof entry.reason !== "string" || entry.reason.trim().length < 8 || entry.attempts !== 2 || !expected.has(entry.seat_id) || failed.has(entry.seat_id)) {
      add(issues, "error", "failure-record", "each failed seat needs one expected seat_id, substantive reason, and exactly two attempts", "RUN.json");
      continue;
    }
    failed.add(entry.seat_id);
    if (!retried.has(entry.seat_id)) {
      add(issues, "error", "failure-retry", `failed seat ${entry.seat_id} has no recorded retry`, "RUN.json");
    }
  }
  if (expectedSeats.length > 0 && failed.size / expectedSeats.length >= 0.2) {
    add(issues, "error", "failure-threshold", "failed seats must remain below 20 percent of the captured roster", "RUN.json");
  }
  if (failed.size > 0 && (typeof run.degraded_reason !== "string" || run.degraded_reason.trim().length < 8)) {
    add(issues, "error", "failure-disclosure", "recorded seat failures require a substantive degraded_reason", "RUN.json");
  }
  return { failed, retried };
}

function parseReaction(text: string, seatId: string, kind: unknown, issues: ValidationIssue[], path: string): ReactionFields | null {
  const fields = new Map<string, string>();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length !== REACTION_LABELS.length) {
    add(issues, "error", "reaction-contract", `${seatId} reaction must contain exactly ten non-empty labeled lines`, path);
  }
  for (const line of lines) {
    const match = /^([A-Z_]+): (.+)$/.exec(line);
    if (!match) {
      const label = /^([A-Za-z_]+)/.exec(line)?.[1];
      const code = label && REACTION_LABEL_SET.has(label) ? "reaction-field" : "reaction-contract";
      add(issues, "error", code, `${seatId} reaction has a malformed or unlabeled line: ${line.slice(0, 48)}`, path);
      continue;
    }
    const [, field, rawValue] = match;
    if (!REACTION_LABEL_SET.has(field)) {
      add(issues, "error", "reaction-label", `${seatId} reaction has unknown label ${field}`, path);
      continue;
    }
    if (fields.has(field)) {
      add(issues, "error", "reaction-duplicate", `${seatId} reaction repeats ${field}`, path);
      continue;
    }
    fields.set(field, rawValue.trim());
  }
  for (const field of REACTION_LABELS) {
    if (!fields.has(field)) {
      add(issues, "error", "reaction-field", `${seatId} reaction must contain one ${field} line`, path);
    }
  }
  const fixed = [
    ["SEAT_ID", PANEL_ID],
    ["DECISION", /^(YES|NO|NOT-APPLICABLE)$/],
    ["INTENSITY", /^([1-5]|NOT-APPLICABLE)$/],
    ["GATE", /^(PASS|FLAG|NOT-APPLICABLE)$/],
    ["CONFIDENCE", /^(LOW|MEDIUM|HIGH)$/],
  ] as const;
  for (const [field, pattern] of fixed) {
    if (!pattern.test(fields.get(field) ?? "")) {
      add(issues, "error", "reaction-field", `${seatId} reaction has an invalid ${field} value`, path);
    }
  }
  for (const field of ["REACTION", "LANDS", "RESISTS", "MISSING", "CHANGE"]) {
    if ((fields.get(field)?.length ?? 0) < 12) {
      add(issues, "error", "reaction-field", `${seatId} reaction needs substantive ${field} text`, path);
    }
  }
  if (fields.get("SEAT_ID") && fields.get("SEAT_ID") !== seatId) {
    add(issues, "error", "reaction-seat", `reaction declares seat ${fields.get("SEAT_ID")}, expected ${seatId}`, path);
  }
  const decision = fields.get("DECISION");
  const intensity = fields.get("INTENSITY");
  const gate = fields.get("GATE");
  if (kind === "specialist") {
    if (decision !== "NOT-APPLICABLE" || intensity !== "NOT-APPLICABLE" || (gate !== "PASS" && gate !== "FLAG")) {
      add(issues, "error", "specialist-reaction", `specialist ${seatId} must use DECISION/INTENSITY NOT-APPLICABLE and GATE PASS or FLAG`, path);
    }
  } else if (decision !== "YES" && decision !== "NO" || !/^[1-5]$/.test(intensity ?? "") || gate !== "NOT-APPLICABLE") {
    add(issues, "error", "customer-reaction", `customer seat ${seatId} must use DECISION YES or NO, INTENSITY 1-5, and GATE NOT-APPLICABLE`, path);
  }
  return fields.size === REACTION_LABELS.length && issues.every((issue) => issue.path !== path || issue.severity !== "error") ? fields : null;
}

interface Citation {
  seat_id: string;
  field: string;
}

interface OutcomeState {
  scorecardTotal: number;
  synthesisConfidence: string;
  resultDecision: string;
  resultConfidence: string;
}

function citations(
  value: unknown,
  reactions: Map<string, ReactionFields>,
  issues: ValidationIssue[],
  code: string,
  path: string,
  dissent = false,
): Citation[] {
  if (!Array.isArray(value) || value.length === 0) {
    add(issues, "error", code, "must be a non-empty array of reaction citations", path);
    return [];
  }
  const parsed: Citation[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.seat_id !== "string" || typeof entry.field !== "string" || !CITABLE_FIELDS.has(entry.field) || !reactions.get(entry.seat_id)?.get(entry.field)) {
      add(issues, "error", code, "must cite an existing reaction seat_id and supported field", path);
      continue;
    }
    if (dissent && !DISSENT_FIELDS.has(entry.field)) {
      add(issues, "error", code, "dissent citations must point to RESISTS, MISSING, DECISION, or GATE", path);
      continue;
    }
    if (dissent && entry.field === "DECISION" && reactions.get(entry.seat_id)?.get(entry.field) !== "NO") {
      add(issues, "error", code, "a DECISION dissent citation must point to NO", path);
      continue;
    }
    if (dissent && entry.field === "GATE" && reactions.get(entry.seat_id)?.get(entry.field) !== "FLAG") {
      add(issues, "error", code, "a GATE dissent citation must point to FLAG", path);
      continue;
    }
    parsed.push({ seat_id: entry.seat_id, field: entry.field });
  }
  return parsed;
}

function stringList(value: unknown, code: string, issues: ValidationIssue[], path: string): void {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string" && entry.trim().length >= 12)) {
    add(issues, "error", code, "must be a non-empty array of substantive strings", path);
  }
}

function validateOutcome(
  outcome: unknown,
  snapshot: SnapshotState,
  reactions: Map<string, ReactionFields>,
  issues: ValidationIssue[],
): OutcomeState | null {
  const path = "OUTCOME.json";
  if (!isRecord(outcome) || outcome.schema_version !== 1) {
    add(issues, "error", "outcome-schema", "OUTCOME.json must be a schema_version 1 object", path);
    return null;
  }
  const errorCount = issues.filter((issue) => issue.severity === "error" && issue.path === path).length;
  const scorecard = isRecord(outcome.scorecard) ? outcome.scorecard : null;
  if (!scorecard || !Array.isArray(scorecard.dimensions) || typeof scorecard.total !== "number" || !Number.isFinite(scorecard.total)) {
    add(issues, "error", "scorecard-data", "OUTCOME.json scorecard requires dimensions and a finite total", path);
  } else {
    const weights = snapshot.dimensions;
    const seen = new Set<string>();
    let total = 0;
    for (const dimension of scorecard.dimensions) {
      if (!isRecord(dimension) || typeof dimension.id !== "string" || typeof dimension.raw_score !== "number" || !Number.isFinite(dimension.raw_score) || typeof dimension.weighted_contribution !== "number" || !Number.isFinite(dimension.weighted_contribution)) {
        add(issues, "error", "scorecard-dimension", "each scorecard dimension needs id, raw_score, and weighted_contribution numbers", path);
        continue;
      }
      const weight = weights.find((frozen) => frozen.id === dimension.id)?.weight;
      if (weight === undefined || seen.has(dimension.id)) {
        add(issues, "error", "scorecard-dimension", `scorecard dimension ${dimension.id} is not a unique frozen dimension`, path);
        continue;
      }
      seen.add(dimension.id);
      if (dimension.raw_score < 0 || dimension.raw_score > 100) {
        add(issues, "error", "score-range", `scorecard dimension ${dimension.id} raw_score must be 0-100`, path);
      }
      const expected = dimension.raw_score * weight / 100;
      if (Math.abs(dimension.weighted_contribution - expected) > 0.0001) {
        add(issues, "error", "score-arithmetic", `scorecard dimension ${dimension.id} contribution must equal raw_score × frozen weight / 100`, path);
      }
      total += dimension.weighted_contribution;
      citations(dimension.evidence, reactions, issues, "score-evidence", path);
    }
    if (seen.size !== weights.length) {
      add(issues, "error", "scorecard-roster", "scorecard must contain every frozen scoring dimension exactly once", path);
    }
    if (Math.abs(scorecard.total - total) > 0.0001 || scorecard.total < 0 || scorecard.total > 100) {
      add(issues, "error", "score-total", "scorecard total must equal the bounded sum of weighted contributions", path);
    }
  }
  const synthesis = isRecord(outcome.synthesis) ? outcome.synthesis : null;
  if (!synthesis) {
    add(issues, "error", "synthesis-data", "OUTCOME.json synthesis object is missing", path);
  } else {
    citations(synthesis.evidence, reactions, issues, "synthesis-evidence", path);
    citations(synthesis.dissent, reactions, issues, "synthesis-dissent", path, true);
    if (typeof synthesis.confidence !== "string" || !CONFIDENCE.has(synthesis.confidence)) {
      add(issues, "error", "synthesis-confidence", "synthesis confidence must be LOW, MEDIUM, or HIGH", path);
    }
    stringList(synthesis.limitations, "synthesis-limitations", issues, path);
  }
  const result = isRecord(outcome.result) ? outcome.result : null;
  if (!result) {
    add(issues, "error", "result-data", "OUTCOME.json result object is missing", path);
  } else {
    if (typeof result.decision !== "string" || !DECISIONS.has(result.decision)) {
      add(issues, "error", "result-decision", "result decision must be SHIP, REVISE, or STOP", path);
    }
    if (typeof result.confidence !== "string" || !CONFIDENCE.has(result.confidence)) {
      add(issues, "error", "result-confidence", "result confidence must be LOW, MEDIUM, or HIGH", path);
    }
    citations(result.evidence, reactions, issues, "result-evidence", path);
    citations(result.dissent, reactions, issues, "result-dissent", path, true);
    stringList(result.limitations, "result-limitations", issues, path);
    if (typeof result.next_experiment !== "string" || result.next_experiment.trim().length < 12) {
      add(issues, "error", "next-experiment", "result next_experiment must be a substantive string", path);
    }
  }
  const finalErrorCount = issues.filter((issue) => issue.severity === "error" && issue.path === path).length;
  if (
    finalErrorCount !== errorCount
    || !scorecard
    || typeof scorecard.total !== "number"
    || !synthesis
    || typeof synthesis.confidence !== "string"
    || !result
    || typeof result.decision !== "string"
    || typeof result.confidence !== "string"
  ) {
    return null;
  }
  return {
    scorecardTotal: scorecard.total,
    synthesisConfidence: synthesis.confidence,
    resultDecision: result.decision,
    resultConfidence: result.confidence,
  };
}

function visibleMarkdownLines(text: string): string[] {
  const visible: string[] = [];
  let commentOpen = false;
  let fenceCharacter: "`" | "~" | null = null;
  let fenceLength = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    if (fenceCharacter) {
      const closing = new RegExp(`^ {0,3}\\${fenceCharacter}{${fenceLength},}[ \\t]*$`);
      if (closing.test(rawLine)) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }

    let line = "";
    let cursor = 0;
    while (cursor < rawLine.length) {
      if (commentOpen) {
        const end = rawLine.indexOf("-->", cursor);
        if (end === -1) {
          cursor = rawLine.length;
          continue;
        }
        commentOpen = false;
        cursor = end + 3;
        continue;
      }
      const start = rawLine.indexOf("<!--", cursor);
      if (start === -1) {
        line += rawLine.slice(cursor);
        break;
      }
      line += rawLine.slice(cursor, start);
      commentOpen = true;
      cursor = start + 4;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fenceCharacter = opening[1][0] as "`" | "~";
      fenceLength = opening[1].length;
      continue;
    }
    visible.push(line);
  }
  return visible;
}

function markdownMarker(lines: string[], marker: string, path: string, issues: ValidationIssue[]): string | null {
  const matching = lines.filter((line) => line.startsWith(`${marker}:`));
  if (matching.length !== 1) {
    add(issues, "error", "markdown-marker", `${path} must contain exactly one ${marker}: <value> marker line`, path);
    return null;
  }
  const match = new RegExp(`^${marker}: ([^\\r\\n]+)$`).exec(matching[0]);
  if (!match) {
    add(issues, "error", "markdown-marker", `${path} ${marker} marker must be a standalone non-empty line`, path);
    return null;
  }
  return match[1];
}

function validateMarkdownOutputs(outputs: MarkdownOutputs, outcome: OutcomeState, issues: ValidationIssue[]): void {
  const visibleOutputs = new Map(
    [...outputs].map(([path, text]) => [path, visibleMarkdownLines(text)]),
  );
  for (const [path, contract] of Object.entries(MARKDOWN_CONTRACTS)) {
    const lines = visibleOutputs.get(path);
    if (!lines) continue;
    for (const section of contract.sections) {
      if (!lines.some((line) => line === `## ${section}`)) {
        add(issues, "error", "markdown-section", `${path} must contain a ## ${section} section`, path);
      }
    }
  }
  const synthesisConfidence = markdownMarker(visibleOutputs.get("SYNTHESIS.md") ?? [], "SYNTHESIS_CONFIDENCE", "SYNTHESIS.md", issues);
  if (synthesisConfidence !== null && synthesisConfidence !== outcome.synthesisConfidence) {
    add(issues, "error", "markdown-agreement", "SYNTHESIS.md SYNTHESIS_CONFIDENCE must match OUTCOME.json synthesis.confidence", "SYNTHESIS.md");
  }
  const scorecardTotal = markdownMarker(visibleOutputs.get("SCORECARD.md") ?? [], "SCORECARD_TOTAL", "SCORECARD.md", issues);
  if (scorecardTotal !== null && scorecardTotal !== String(outcome.scorecardTotal)) {
    add(issues, "error", "markdown-agreement", "SCORECARD.md SCORECARD_TOTAL must match OUTCOME.json scorecard.total", "SCORECARD.md");
  }
  const resultDecision = markdownMarker(visibleOutputs.get("RESULT.md") ?? [], "RESULT_DECISION", "RESULT.md", issues);
  if (resultDecision !== null && resultDecision !== outcome.resultDecision) {
    add(issues, "error", "markdown-agreement", "RESULT.md RESULT_DECISION must match OUTCOME.json result.decision", "RESULT.md");
  }
  const resultConfidence = markdownMarker(visibleOutputs.get("RESULT.md") ?? [], "RESULT_CONFIDENCE", "RESULT.md", issues);
  if (resultConfidence !== null && resultConfidence !== outcome.resultConfidence) {
    add(issues, "error", "markdown-agreement", "RESULT.md RESULT_CONFIDENCE must match OUTCOME.json result.confidence", "RESULT.md");
  }
}

const PRESSED_SUFFIX = ".pressed.md";

/**
 * Score-level guards that read the reactions themselves: the specialist/core-NO
 * cap (F2), the recomputed spread and agreement (F3), and the unanimity press (F4).
 */
async function validateConsensus(
  runDir: string,
  outcome: RecordValue,
  snapshot: SnapshotState,
  reactions: Map<string, ReactionFields>,
  issues: ValidationIssue[],
): Promise<void> {
  const path = "OUTCOME.json";
  const seatOf = (id: string) => snapshot.activeSeats.find((seat) => seat.id === id);
  const result = isRecord(outcome.result) ? outcome.result : null;

  const capSeats = [...reactions].filter(([id, fields]) => {
    const seat = seatOf(id);
    if (seat?.kind === "specialist") return fields.get("GATE") === "FLAG";
    return seat?.fit === "core" && fields.get("DECISION") === "NO" && /^[45]$/.test(fields.get("INTENSITY") ?? "");
  }).map(([id]) => id);
  if (capSeats.length > 0 && result?.decision === "SHIP") {
    const override = typeof result.override === "string" ? result.override : "";
    // Whole seat ids only: an override naming buyer-2 must not cover buyer.
    const named = new Set(override.split(/[^a-z0-9-]+/));
    const unnamed = capSeats.filter((id) => !named.has(id));
    if (override.trim().length === 0 || unnamed.length > 0) {
      add(issues, "error", "cap-not-applied", `result is SHIP while ${capSeats.join(", ")} cap the decision; result.override must name ${unnamed.join(", ") || capSeats.join(", ")}`, path);
    }
  }

  const customers = [...reactions].filter(([id]) => {
    const kind = seatOf(id)?.kind;
    return kind !== undefined && kind !== "specialist";
  });
  const scores = customers.map(([, fields]) => (fields.get("DECISION") === "NO" ? -1 : 1) * Number(fields.get("INTENSITY")));
  const yes = customers.filter(([, fields]) => fields.get("DECISION") === "YES").length;
  const expectedSpread = scores.length > 0 ? Math.max(...scores) - Math.min(...scores) : 0;
  const expectedAgreement = customers.length > 0 ? Math.round(Math.max(yes, customers.length - yes) / customers.length * 100) / 100 : 0;
  const consensus = isRecord(outcome.consensus) ? outcome.consensus : null;
  if (!consensus || consensus.spread !== expectedSpread || consensus.agreement !== expectedAgreement) {
    add(issues, "error", "consensus-mismatch", `OUTCOME.json consensus must be { spread: ${expectedSpread}, agreement: ${expectedAgreement} } recomputed from the customer reactions`, path);
  }

  const unanimous = customers.length > 0 && (yes === 0 || yes === customers.length);
  if (!unanimous) return;
  const pressedSeat = consensus?.pressed_seat;
  const pressedKind = typeof pressedSeat === "string" ? seatOf(pressedSeat)?.kind : undefined;
  if (typeof pressedSeat !== "string" || !reactions.has(pressedSeat) || pressedKind === "specialist") {
    add(issues, "error", "unanimity-unpressed", "every customer seat gave the same DECISION; consensus.pressed_seat must name a customer seat with a reaction", path);
    return;
  }
  const pressedPath = join("reactions", `${pressedSeat}${PRESSED_SUFFIX}`);
  try {
    const full = await readRunFile(runDir, pressedPath);
    if (!(await fileExists(full))) {
      add(issues, "error", "unanimity-unpressed", `unanimous run has no pressed reaction for ${pressedSeat}`, pressedPath);
      return;
    }
    parseReaction(await readFile(full, "utf8"), pressedSeat, pressedKind, issues, pressedPath);
    add(issues, "warning", "unverified-isolation", `pressed reaction ${pressedPath} is operator-recorded and unverified; this validator does not prove isolation`, pressedPath);
  } catch (error) {
    add(issues, "error", "unanimity-unpressed", error instanceof Error ? error.message : String(error), pressedPath);
  }
}

async function validateComplete(
  runDir: string,
  run: RecordValue,
  snapshot: SnapshotState,
  expectedSeats: string[],
  issues: ValidationIssue[],
): Promise<void> {
  if (run.status !== "complete") {
    add(issues, "error", "run-status", 'RUN.json status must be "complete"', "RUN.json");
  }
  if (!isIsoTimestamp(run.completed_at)) {
    add(issues, "error", "completed-at", "a complete run must record a valid completed_at ISO UTC timestamp", "RUN.json");
  } else if (isIsoTimestamp(run.created_at) && Date.parse(run.completed_at) < Date.parse(run.created_at)) {
    add(issues, "error", "run-chronology", "RUN.json completed_at must not be earlier than created_at", "RUN.json");
  }
  if (typeof run.execution_mode !== "string" || !EXECUTION_MODES.has(run.execution_mode) || run.execution_mode === "unassigned") {
    add(issues, "error", "execution-mode", "actual execution mode was not recorded", "RUN.json");
  }
  if (run.execution_mode === SHARED_CONTEXT_MODE && (typeof run.degraded_reason !== "string" || run.degraded_reason.trim().length < 8)) {
    add(issues, "error", "degraded-reason", "shared-context execution requires a substantive degraded_reason", "RUN.json");
  }
  if (run.execution_provenance !== "operator-recorded" && run.execution_provenance !== "runtime-attested") {
    add(issues, "error", "execution-provenance", "execution_provenance must be operator-recorded or runtime-attested", "RUN.json");
  } else if (run.execution_provenance === "operator-recorded" && ISOLATED_MODES.has(run.execution_mode as string)) {
    add(issues, "warning", "unverified-isolation", "isolated execution is operator-recorded and unverified; this validator does not prove isolation", "RUN.json");
  } else if (run.execution_provenance === "runtime-attested") {
    const attestation = isRecord(run.isolation_attestation) ? run.isolation_attestation : null;
    const attestationIsInRunWindow = attestation
      && isIsoTimestamp(attestation.issued_at)
      && isIsoTimestamp(run.created_at)
      && isIsoTimestamp(run.completed_at)
      && Date.parse(attestation.issued_at) >= Date.parse(run.created_at)
      && Date.parse(attestation.issued_at) <= Date.parse(run.completed_at);
    if (!attestation || typeof attestation.provider !== "string" || attestation.provider.trim().length < 3 || !isIsoTimestamp(attestation.issued_at) || typeof attestation.reference !== "string" || attestation.reference.trim().length < 8 || typeof attestation.run_id !== "string" || attestation.run_id !== run.run_id || !attestationIsInRunWindow) {
      add(issues, "error", "isolation-attestation", "runtime-attested execution requires provider, a valid issued_at inside the run window, reference, and a run_id exactly matching RUN.json", "RUN.json");
    }
  }
  const failures = validateFailures(run, expectedSeats, issues);
  const reactions = new Map<string, ReactionFields>();
  for (const seatId of expectedSeats) {
    const path = join("reactions", `${seatId}.md`);
    if (failures.failed.has(seatId)) {
      try {
        if (await fileExists(await resolveWriteWithin(runDir, path))) {
          add(issues, "error", "failed-reaction", `failed seat ${seatId} must not also have a reaction`, path);
        }
      } catch (error) {
        add(issues, "error", "reaction-path", error instanceof Error ? error.message : String(error), path);
      }
      continue;
    }
    let reactionPath: string;
    try {
      reactionPath = await readRunFile(runDir, path);
    } catch (error) {
      add(issues, "error", "reaction-path", error instanceof Error ? error.message : String(error), path);
      continue;
    }
    if (!(await fileExists(reactionPath))) {
      add(issues, "error", "missing-reaction", `reaction is missing for ${seatId}`, path);
      continue;
    }
    const fields = parseReaction(await readFile(reactionPath, "utf8"), seatId, snapshot.activeSeats.find((seat) => seat.id === seatId)?.kind, issues, path);
    if (fields) {
      reactions.set(seatId, fields);
    }
  }
  const outputs: MarkdownOutputs = new Map();
  for (const output of ["SYNTHESIS.md", "SCORECARD.md", "RESULT.md"]) {
    try {
      const path = await readRunFile(runDir, output);
      if (!(await fileExists(path))) {
        add(issues, "error", "missing-output", `${output} is missing`, output);
        continue;
      }
      const text = await readFile(path, "utf8");
      outputs.set(output, text);
      if (text.trim().length < 80 || /Status:\s*prepared|<TODO>|Replace with/i.test(text)) {
        add(issues, "error", "output-placeholder", `${output} is incomplete or has placeholder text`, output);
      }
    } catch (error) {
      add(issues, "error", "output-path", error instanceof Error ? error.message : String(error), output);
    }
  }
  try {
    const rawOutcome = await readJson(await readRunFile(runDir, "OUTCOME.json"));
    const outcome = validateOutcome(rawOutcome, snapshot, reactions, issues);
    if (outcome) validateMarkdownOutputs(outputs, outcome, issues);
    if (isRecord(rawOutcome)) await validateConsensus(runDir, rawOutcome, snapshot, reactions, issues);
  } catch (error) {
    add(issues, "error", "outcome-json", error instanceof Error ? error.message : String(error), "OUTCOME.json");
  }
  try {
    const reactionsDir = await readRunFile(runDir, "reactions");
    const names = (await readdir(reactionsDir)).filter((name) => name.endsWith(".md") && name !== "INDEX.md" && !name.endsWith(PRESSED_SUFFIX));
    for (const extra of names.map((name) => name.replace(/\.md$/, "")).filter((name) => !expectedSeats.includes(name))) {
      add(issues, "warning", "extra-reaction", `reaction ${extra} is not in the captured roster and was ignored`, join("reactions", `${extra}.md`));
    }
  } catch (error) {
    add(issues, "error", "reactions-directory", error instanceof Error ? error.message : String(error), "reactions");
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const preparedOnly = argv.includes("--prepared");
  const positional = argv.filter((value) => value !== "--prepared");
  if (positional.length !== 1) {
    usage();
  }
  const issues: ValidationIssue[] = [];
  const input = resolve(positional[0]);
  let runDir: string;
  let workspace: string;
  try {
    const lexicalRuns = dirname(input);
    workspace = await canonicalDirectory(dirname(lexicalRuns), "panel workspace");
    const runsDir = await resolveReadWithin(workspace, "runs");
    runDir = await canonicalDirectory(input, "run folder");
    if (!directRunChild(runsDir, runDir)) {
      throw new Error("run folder must be a direct child of the workspace runs directory");
    }
  } catch (error) {
    add(issues, "error", "run-boundary", error instanceof Error ? error.message : String(error), input);
    console.log(formatIssues(issues));
    process.exit(1);
  }
  let run: RecordValue;
  let snapshot: RecordValue;
  try {
    const runData = await readJson(await readRunFile(runDir, "RUN.json"));
    const snapshotData = await readJson(await readRunFile(runDir, "panel-snapshot.json"));
    if (!isRecord(runData) || !isRecord(snapshotData)) {
      throw new Error("RUN.json and panel-snapshot.json must contain objects");
    }
    run = runData;
    snapshot = snapshotData;
  } catch (error) {
    add(issues, "error", "run-packet", error instanceof Error ? error.message : String(error), runDir);
    console.log(formatIssues(issues));
    process.exit(1);
  }
  const prepared = await validatePrepared(runDir, run, snapshot, issues);
  if (!preparedOnly) {
    await validateComplete(runDir, run, prepared.snapshot, prepared.expectedSeats, issues);
  }
  console.log(formatIssues(issues));
  console.log(`run: ${typeof run.run_id === "string" ? run.run_id : "unavailable"}; expected seats: ${prepared.expectedSeats.length}`);
  if (hasErrors(issues)) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`validate-run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
