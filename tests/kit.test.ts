import { afterAll, describe, expect, runCommand, test } from "./harness.ts";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { pickAvatars, REQUIRED_DOSSIER_HEADINGS } from "../skills/synthetic-customer-panel/scripts/lib.ts";
import { loadRun } from "../skills/synthetic-customer-panel/scripts/run-view.ts";

const KIT_ROOT = resolve(import.meta.dirname, "..");
const SCRIPT_ROOT = join(KIT_ROOT, "skills", "synthetic-customer-panel", "scripts");
let caseRoot = "";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface SnapshotFixture {
  panel: Record<string, unknown>;
  seats: Array<Record<string, unknown>>;
  scoring: { dimensions: Array<Record<string, unknown>> };
}

async function runScript(script: string, args: string[]): Promise<CommandResult> {
  return runCommand(["node", join(SCRIPT_ROOT, script), ...args], KIT_ROOT);
}

function detailWords(seed: string, count = 30): string {
  return Array.from({ length: count }, (_, index) =>
    `${seed}finding${index} ${seed}constraint${index} ${seed}behavior${index}`,
  ).join(" ");
}

function dossier(seatId: string, name: string, filler = false): string {
  const seed = seatId.replace(/-/g, "");
  const sections = REQUIRED_DOSSIER_HEADINGS.map((heading, index) => {
    const content = filler
      ? Array.from({ length: 60 }, () => "repeated filler phrase evidence assumption context decision").join(" ")
      : detailWords(`${seed}${index}`);
    if (heading === "Evidence basis") {
      return `## ${heading}\n\n- Evidence: ${seed} interview observation — shows a distinct decision constraint in the synthetic test fixture.\n\n${content}`;
    }
    if (heading === "Modeled assumptions") {
      return `## ${heading}\n\n- Assumption: ${seed} composite choice — can be checked against a distinct real-world observation after the test.\n\n${content}`;
    }
    return `## ${heading}\n\n${content}`;
  });
  return [`# ${name}`, "", `Seat ID: ${seatId}`, "", ...sections, ""].join("\n");
}

function reaction(seat: { id: string; kind: string; fit: string }): string {
  const specialist = seat.kind === "specialist";
  return [
    `SEAT_ID: ${seat.id}`,
    `DECISION: ${specialist ? "NOT-APPLICABLE" : seat.fit === "hard-no" ? "NO" : "YES"}`,
    `INTENSITY: ${specialist ? "NOT-APPLICABLE" : "4"}`,
    `GATE: ${specialist ? "FLAG" : "NOT-APPLICABLE"}`,
    "CONFIDENCE: MEDIUM",
    "REACTION: The controlled workflow claim is specific enough for this deterministic fixture reaction.",
    "LANDS: The constrained workflow language names a concrete operational outcome.",
    "RESISTS: The evidence remains directional and needs a real-world check.",
    "MISSING: A concrete demonstration with observable implementation details.",
    "CHANGE: Add one concrete demonstration before asking for the next action.",
  ].join("\n");
}

function outcome(): Record<string, unknown> {
  const citation = { seat_id: "economic-buyer", field: "REACTION" };
  const dissent = { seat_id: "principled-hard-no", field: "DECISION" };
  return {
    schema_version: 1,
    consensus: { spread: 8, agreement: 0.75 },
    scorecard: {
      dimensions: [
        { id: "core-fit", raw_score: 80, weighted_contribution: 32, evidence: [citation] },
        { id: "trust", raw_score: 70, weighted_contribution: 24.5, evidence: [citation] },
        { id: "action", raw_score: 60, weighted_contribution: 15, evidence: [citation] },
      ],
      total: 71.5,
    },
    synthesis: {
      evidence: [citation],
      dissent: [dissent],
      confidence: "MEDIUM",
      limitations: ["Synthetic reactions are directional and require measured real-world comparison."],
    },
    result: {
      decision: "REVISE",
      confidence: "MEDIUM",
      evidence: [citation],
      dissent: [dissent],
      limitations: ["The fixture has no real customer outcome and cannot establish conversion behavior."],
      next_experiment: "Show the revised page to five qualified operators and record requested review calls.",
    },
  };
}

function synthesisMarkdown(confidence = "MEDIUM"): string {
  return [
    `SYNTHESIS_CONFIDENCE: ${confidence}`,
    "",
    "# Synthesis",
    "",
    "## Decision table",
    "The buyer pattern is directional and the hard-no remains visible.",
    "",
    "## Agreement clusters",
    "The fixture reactions agree that a concrete demonstration is still needed.",
    "",
    "## Consequential dissent",
    "The hard-no seat rejects the claim until policy constraints are addressed.",
    "",
    "## Limitations",
    "Synthetic reactions require measured real-world comparison before any claim.",
  ].join("\n");
}

function scorecardMarkdown(total = "71.5"): string {
  return [
    `SCORECARD_TOTAL: ${total}`,
    "",
    "# Scorecard",
    "",
    "## Dimension arithmetic",
    "The frozen dimensions and cited reactions produce the stated directional score.",
    "",
    "## Total",
    "The displayed total is the sum of the validated weighted contributions.",
  ].join("\n");
}

function resultMarkdown(decision = "REVISE", confidence = "MEDIUM"): string {
  return [
    `RESULT_DECISION: ${decision}`,
    `RESULT_CONFIDENCE: ${confidence}`,
    "",
    "# Panel Result",
    "",
    "## Evidence",
    "The fixture supports a controlled revision rather than a production claim.",
    "",
    "## Dissent",
    "The hard-no objection remains a consequential constraint on the next step.",
    "",
    "## Limitations",
    "The test cannot establish conversion behavior without real customer evidence.",
    "",
    "## Next experiment",
    "Show the revised page to qualified operators and record their requested review calls.",
  ].join("\n");
}

afterAll(async () => {
  if (caseRoot) {
    await rm(caseRoot, { recursive: true, force: true });
  }
});

describe("synthetic customer panel kit", () => {
  test("confines a portable workspace and validates the deterministic methodology", async () => {
    caseRoot = await mkdtemp(join(tmpdir(), "synthetic-customer-panel-"));
    const ownedRoot = join(caseRoot, "owned");
    const workspace = join(ownedRoot, "workspace");
    await mkdir(ownedRoot);

    const escapedInit = await runScript("init-panel.ts", [
      "--owned-root", ownedRoot, join(caseRoot, "outside"), "--name", "Escaped",
    ]);
    expect(escapedInit.code).toBe(1);
    expect(escapedInit.stderr).toContain("path escapes the panel workspace");

    const initialized = await runScript("init-panel.ts", [
      "--owned-root", ownedRoot, workspace, "--name", "Fixture Buyer Panel",
    ]);
    expect(initialized.code).toBe(0);
    expect(initialized.stdout).toContain("initialized draft panel");

    const draft = await runScript("validate-panel.ts", [workspace, "--allow-draft"]);
    expect(draft.code).toBe(0);
    expect(draft.stdout).toContain("WARNING seat-count");

    const seats = [
      { id: "economic-buyer", name: "Morgan Lee", kind: "buyer", fit: "core", dossier: "dossiers/economic-buyer.md", decision_signal: "Authorize a scoped workflow review.", gender: "woman", active: true },
      { id: "daily-user", name: "Alex Rivera", kind: "user", fit: "core", dossier: "dossiers/daily-user.md", decision_signal: "Adopt the proposed workflow in daily operations.", gender: "man", active: true },
      { id: "skeptical-operator", name: "Jordan Patel", kind: "buyer", fit: "core", dossier: "dossiers/skeptical-operator.md", decision_signal: "Approve a small proof-of-concept before changing process.", gender: "woman", active: true },
      { id: "referral-influencer", name: "Casey Brooks", kind: "influencer", fit: "adjacent", dossier: "dossiers/referral-influencer.md", decision_signal: "Recommend the workflow review to a qualified peer.", gender: "man", active: true },
      { id: "principled-hard-no", name: "Taylor Chen", kind: "buyer", fit: "hard-no", dossier: "dossiers/principled-hard-no.md", decision_signal: "Decline the offer because the approach conflicts with the standing policy.", gender: "woman", active: true },
      { id: "implementation-specialist", name: "Riley Morgan", kind: "specialist", fit: "adjacent", dossier: "dossiers/implementation-specialist.md", decision_signal: "Flag implementation risks before the owner runs a controlled test.", active: true },
    ];
    const manifestPath = join(workspace, "panel.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    Object.assign(manifest.panel, {
      objective: "Assess whether qualified operations buyers would request a scoped workflow review.",
      decision_signal: "Inform the owner whether to run a controlled workflow review test.",
      artifact_types: ["landing-page-copy"],
      status: "ready",
      review_due: "2027-01-01",
      calibration_outcome: "Qualified review requests",
      calibration_horizon: "14 days after publication",
    });
    manifest.scoring.dimensions = [
      { id: "core-fit", label: "Core customer fit", weight: 40 },
      { id: "trust", label: "Trust and credibility", weight: 35 },
      { id: "action", label: "Action likelihood", weight: 25 },
    ];
    manifest.seats = seats.map((seat) => ({ ...seat }));
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(workspace, "owner", "OWNER-CONTEXT.md"), "# Owner Context\n\nA truthful fixture owner context with a controlled workflow offer.\n");
    await writeFile(join(workspace, "evidence", "SOURCE-NOTES.md"), "# Source Notes\n\n- Source: fixture interview set with decision-relevant observations.\n");
    for (const seat of seats) {
      await writeFile(join(workspace, seat.dossier), dossier(seat.id, seat.name));
    }

    const strict = await runScript("validate-panel.ts", [workspace]);
    expect(strict.code).toBe(0);
    expect(strict.stdout).toContain("PASS: no validation issues");

    manifest.seats[1].dossier = manifest.seats[0].dossier;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const duplicateDossier = await runScript("validate-panel.ts", [workspace]);
    expect(duplicateDossier.code).toBe(1);
    expect(duplicateDossier.stdout).toContain("duplicate-dossier");
    manifest.seats[1].dossier = seats[1].dossier;

    await writeFile(join(workspace, seats[1].dossier), dossier(seats[1].id, seats[1].name, true));
    await writeFile(manifestPath, JSON.stringify(manifest));
    const filler = await runScript("validate-panel.ts", [workspace]);
    expect(filler.code).toBe(1);
    expect(filler.stdout).toContain("dossier-filler");
    await writeFile(join(workspace, seats[1].dossier), dossier(seats[1].id, seats[1].name));

    await writeFile(join(workspace, seats[2].dossier), await readFile(join(workspace, seats[0].dossier), "utf8"));
    const similar = await runScript("validate-panel.ts", [workspace]);
    expect(similar.code).toBe(1);
    expect(similar.stdout).toContain("dossier-similarity");
    await writeFile(join(workspace, seats[2].dossier), dossier(seats[2].id, seats[2].name));

    manifest.scoring.dimensions = [null];
    await writeFile(manifestPath, JSON.stringify(manifest));
    const malformed = await runScript("validate-panel.ts", [workspace]);
    expect(malformed.code).toBe(1);
    expect(malformed.stdout).toContain("dimension-shape");
    manifest.scoring.dimensions = [
      { id: "core-fit", label: "Core customer fit", weight: 40 },
      { id: "trust", label: "Trust and credibility", weight: 35 },
      { id: "action", label: "Action likelihood", weight: 25 },
    ];
    await writeFile(manifestPath, JSON.stringify(manifest));

    const external = join(caseRoot, "external.md");
    await writeFile(external, "external support content");
    await symlink(external, join(workspace, "owner", "escape.md"));
    manifest.panel.owner_context = "owner/escape.md";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const escapedSupport = await runScript("validate-panel.ts", [workspace]);
    expect(escapedSupport.code).toBe(1);
    expect(escapedSupport.stdout).toContain("unsafe-path");
    manifest.panel.owner_context = "owner/OWNER-CONTEXT.md";
    await writeFile(manifestPath, JSON.stringify(manifest));

    const artifactPath = join(workspace, "inputs", "fixture-page.md");
    await writeFile(artifactPath, "# Workflow Review\n\n~~~~~~\n\nWe help operations teams find one controlled workflow improvement.");
    const prepared = await runScript("prepare-run.ts", [workspace, artifactPath, "--slug", "fixture"]);
    expect(prepared.code).toBe(0);
    const runDir = prepared.stdout.match(/^prepared run:\s*(.+)$/m)?.[1];
    expect(runDir).toBeTruthy();
    if (!runDir) throw new Error("prepare-run did not report its run folder");
    const runPath = join(runDir, "RUN.json");
    const snapshotPath = join(runDir, "panel-snapshot.json");
    const run = JSON.parse(await readFile(runPath, "utf8"));
    expect(JSON.stringify(run)).not.toContain(artifactPath);
    expect(run.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(run.panel_snapshot_sha256).toMatch(/^[a-f0-9]{64}$/);
    const task = await readFile(join(runDir, "tasks", "economic-buyer.md"), "utf8");
    expect(task).toContain("Role-specific decision signal: Authorize a scoped workflow review.");
    expect(task).toContain("~~~~~~~text");
    const copiedArtifact = await readFile(join(runDir, run.artifact_file), "utf8");
    expect(task).toContain(copiedArtifact);
    await writeFile(artifactPath, "MUTABLE SOURCE CONTENT MUST NOT ENTER THE TASK");
    expect(task).not.toContain("MUTABLE SOURCE CONTENT MUST NOT ENTER THE TASK");

    run.artifact_file = "../panel-snapshot.json";
    await writeFile(runPath, JSON.stringify(run));
    const hostileRun = await runScript("validate-run.ts", [runDir, "--prepared"]);
    expect(hostileRun.code).toBe(1);
    expect(hostileRun.stdout).toContain("artifact-path");
    run.artifact_file = run.artifact_label;
    await writeFile(runPath, JSON.stringify(run));
    const preparedValidation = await runScript("validate-run.ts", [runDir, "--prepared"]);
    expect(preparedValidation.code).toBe(0);

    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as SnapshotFixture;
    const validButChangedSnapshot = structuredClone(snapshot);
    validButChangedSnapshot.panel.name = "Changed Snapshot Name";
    await writeFile(snapshotPath, JSON.stringify(validButChangedSnapshot));
    const changedSnapshot = await runScript("validate-run.ts", [runDir, "--prepared"]);
    expect(changedSnapshot.code).toBe(1);
    expect(changedSnapshot.stdout).toContain("snapshot-hash");
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    const expectPreparedRejection = async (
      mutate: (candidate: SnapshotFixture) => void,
      code: string,
    ): Promise<void> => {
      const candidate = structuredClone(snapshot);
      mutate(candidate);
      await writeFile(snapshotPath, JSON.stringify(candidate));
      const result = await runScript("validate-run.ts", [runDir, "--prepared"]);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(code);
      await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    };
    await expectPreparedRejection((candidate) => {
      candidate.panel.objective = "";
    }, "snapshot-panel-field");
    await expectPreparedRejection((candidate) => {
      candidate.seats[1].id = "economic-buyer";
    }, "snapshot-seat-id");
    await expectPreparedRejection((candidate) => {
      candidate.seats[0].kind = "observer";
    }, "snapshot-seat-kind");
    await expectPreparedRejection((candidate) => {
      candidate.seats[0].fit = "maybe";
    }, "snapshot-seat-fit");
    await expectPreparedRejection((candidate) => {
      candidate.seats[0].decision_signal = "";
    }, "snapshot-decision-signal");
    await expectPreparedRejection((candidate) => {
      for (const seat of candidate.seats) seat.fit = seat.id === "principled-hard-no" ? "hard-no" : "adjacent";
    }, "snapshot-core-coverage");
    await expectPreparedRejection((candidate) => {
      for (const seat of candidate.seats) seat.fit = "core";
    }, "snapshot-dissent-coverage");
    await expectPreparedRejection((candidate) => {
      candidate.scoring.dimensions = candidate.scoring.dimensions.slice(0, 2);
    }, "snapshot-dimension-count");
    await expectPreparedRejection((candidate) => {
      candidate.scoring.dimensions[1].id = "core-fit";
    }, "snapshot-dimension-id");
    await expectPreparedRejection((candidate) => {
      candidate.scoring.dimensions[0].weight = 0;
    }, "snapshot-dimension-weight");
    await expectPreparedRejection((candidate) => {
      candidate.scoring.dimensions[0].weight = 41;
    }, "snapshot-scoring-total");
    await rm(join(workspace, "owner", "OWNER-CONTEXT.md"));
    await rm(join(workspace, seats[0].dossier));
    const snapshotOnly = await runScript("validate-run.ts", [runDir, "--prepared"]);
    expect(snapshotOnly.code).toBe(0);

    for (const seat of seats) {
      if (seat.id !== "referral-influencer") {
        await writeFile(join(runDir, "reactions", `${seat.id}.md`), reaction(seat));
      }
    }
    run.status = "complete";
    run.execution_mode = "isolated-parallel";
    run.runtime = "fixture";
    run.model = "fixture";
    run.completed_at = new Date().toISOString();
    run.failed_seats = [{ seat_id: "referral-influencer", reason: "The first response was malformed after two recorded attempts.", attempts: 2 }];
    run.retried_seats = [{ seat_id: "referral-influencer", reason: "A second task was issued after the malformed first response." }];
    run.degraded_reason = "One influencer reaction failed after a retry, so the synthesis excludes that seat.";
    await writeFile(runPath, JSON.stringify(run));
    run.completed_at = "not-a-timestamp";
    await writeFile(runPath, JSON.stringify(run));
    const invalidCompletedAt = await runScript("validate-run.ts", [runDir]);
    expect(invalidCompletedAt.code).toBe(1);
    expect(invalidCompletedAt.stdout).toContain("completed-at");
    run.completed_at = new Date().toISOString();
    run.created_at = new Date(Date.parse(run.completed_at) + 1_000).toISOString();
    await writeFile(runPath, JSON.stringify(run));
    const invalidChronology = await runScript("validate-run.ts", [runDir]);
    expect(invalidChronology.code).toBe(1);
    expect(invalidChronology.stdout).toContain("run-chronology");
    run.created_at = new Date(Date.parse(run.completed_at) - 1_000).toISOString();
    run.run_id = "other-run";
    await writeFile(runPath, JSON.stringify(run));
    const invalidRunId = await runScript("validate-run.ts", [runDir]);
    expect(invalidRunId.code).toBe(1);
    expect(invalidRunId.stdout).toContain("run-id");
    run.run_id = basename(runDir);
    await writeFile(runPath, JSON.stringify(run));
    await writeFile(join(runDir, "SYNTHESIS.md"), synthesisMarkdown());
    await writeFile(join(runDir, "SCORECARD.md"), scorecardMarkdown());
    await writeFile(join(runDir, "RESULT.md"), resultMarkdown());
    await writeFile(join(runDir, "OUTCOME.json"), JSON.stringify(outcome()));
    for (const [suffix, expectedCode] of [
      ["\nDECISION: MAYBE", "reaction-duplicate"],
      ["\nUNKNOWN: This is not a permitted output field.", "reaction-label"],
      ["\nThis unlabelled prose is not allowed.", "reaction-contract"],
      ["\nDECISION: YES definitely", "reaction-contract"],
    ] as const) {
      await writeFile(join(runDir, "reactions", "daily-user.md"), `${reaction(seats[1])}${suffix}`);
      const invalidReaction = await runScript("validate-run.ts", [runDir]);
      expect(invalidReaction.code).toBe(1);
      expect(invalidReaction.stdout).toContain(expectedCode);
    }

    await writeFile(join(runDir, "reactions", "daily-user.md"), reaction(seats[1]));
    run.execution_provenance = "runtime-attested";
    run.isolation_attestation = {
      provider: "fixture-runtime",
      issued_at: "not-a-timestamp",
      reference: "fixture-runtime-reference",
      run_id: run.run_id,
    };
    await writeFile(runPath, JSON.stringify(run));
    const invalidAttestationTime = await runScript("validate-run.ts", [runDir]);
    expect(invalidAttestationTime.code).toBe(1);
    expect(invalidAttestationTime.stdout).toContain("isolation-attestation");
    run.isolation_attestation.issued_at = new Date().toISOString();
    run.isolation_attestation.run_id = "other-run";
    await writeFile(runPath, JSON.stringify(run));
    const invalidAttestationRun = await runScript("validate-run.ts", [runDir]);
    expect(invalidAttestationRun.code).toBe(1);
    expect(invalidAttestationRun.stdout).toContain("isolation-attestation");
    run.isolation_attestation.run_id = run.run_id;
    run.isolation_attestation.issued_at = new Date(Date.parse(run.created_at) - 1_000).toISOString();
    await writeFile(runPath, JSON.stringify(run));
    const invalidAttestationWindow = await runScript("validate-run.ts", [runDir]);
    expect(invalidAttestationWindow.code).toBe(1);
    expect(invalidAttestationWindow.stdout).toContain("isolation-attestation");
    run.isolation_attestation.issued_at = run.completed_at;
    await writeFile(runPath, JSON.stringify(run));
    const attested = await runScript("validate-run.ts", [runDir]);
    expect(attested.code).toBe(0);
    run.execution_provenance = "operator-recorded";
    run.isolation_attestation = null;
    await writeFile(runPath, JSON.stringify(run));

    const invalidOutcome = outcome();
    (invalidOutcome.scorecard as { dimensions: Array<{ weighted_contribution: number }> }).dimensions[0].weighted_contribution = 31;
    await writeFile(join(runDir, "OUTCOME.json"), JSON.stringify(invalidOutcome));
    const arithmetic = await runScript("validate-run.ts", [runDir]);
    expect(arithmetic.code).toBe(1);
    expect(arithmetic.stdout).toContain("score-arithmetic");

    await writeFile(join(runDir, "OUTCOME.json"), JSON.stringify(outcome()));
    for (const [path, content, expectedCode] of [
      ["SYNTHESIS.md", synthesisMarkdown("HIGH"), "markdown-agreement"],
      ["SCORECARD.md", scorecardMarkdown("72"), "markdown-agreement"],
      ["RESULT.md", resultMarkdown("SHIP"), "markdown-agreement"],
      ["RESULT.md", resultMarkdown("REVISE", "HIGH"), "markdown-agreement"],
      ["SYNTHESIS.md", synthesisMarkdown().replace("## Consequential dissent\n", ""), "markdown-section"],
      ["SCORECARD.md", scorecardMarkdown().replace("## Total\n", ""), "markdown-section"],
      ["RESULT.md", resultMarkdown().replace("## Next experiment\n", ""), "markdown-section"],
      ["SYNTHESIS.md", synthesisMarkdown().replace("SYNTHESIS_CONFIDENCE: MEDIUM", "```text\nSYNTHESIS_CONFIDENCE: MEDIUM\n````"), "markdown-marker"],
      ["SCORECARD.md", scorecardMarkdown().replace("SCORECARD_TOTAL: 71.5", "~~~~text\nSCORECARD_TOTAL: 71.5\n~~~~~"), "markdown-marker"],
      ["RESULT.md", resultMarkdown().replace("## Next experiment", "<!--\n## Next experiment\n-->"), "markdown-section"],
    ] as const) {
      await writeFile(join(runDir, path), content);
      const invalidMarkdown = await runScript("validate-run.ts", [runDir]);
      expect(invalidMarkdown.code).toBe(1);
      expect(invalidMarkdown.stdout).toContain(expectedCode);
      await writeFile(join(runDir, "SYNTHESIS.md"), synthesisMarkdown());
      await writeFile(join(runDir, "SCORECARD.md"), scorecardMarkdown());
      await writeFile(join(runDir, "RESULT.md"), resultMarkdown());
    }
    const complete = await runScript("validate-run.ts", [runDir]);
    expect(complete.code).toBe(0);
    expect(complete.stdout).toContain("WARNING unverified-isolation");

    // Scoring guards: quotes, uncapped ships, consensus drift, unpressed unanimity, missing misfires.
    // The snapshot check above removed these to prove the snapshot stands alone; the panel rows need them back.
    await writeFile(join(workspace, "owner", "OWNER-CONTEXT.md"), "# Owner Context\n\nA truthful fixture owner context with a controlled workflow offer.\n");
    await writeFile(join(workspace, seats[0].dossier), dossier(seats[0].id, seats[0].name));
    const buyerDossier = join(workspace, seats[0].dossier);
    const hardNoReaction = join(runDir, "reactions", "principled-hard-no.md");
    const outcomePath = join(runDir, "OUTCOME.json");
    // A unanimous run has no NO to cite, so its dissent cites a RESISTS line instead.
    const resists = [{ seat_id: "principled-hard-no", field: "RESISTS" }];
    const base = outcome();
    const unanimousPressed = {
      ...base,
      consensus: { spread: 0, agreement: 1, pressed_seat: "economic-buyer" },
      synthesis: { ...(base.synthesis as object), dissent: resists },
      result: { ...(base.result as object), dissent: resists },
    };
    const reportPath = join(caseRoot, "REPORT.html");
    let savedRun = "";
    const avatarMeta = JSON.parse(await readFile(join(SCRIPT_ROOT, "..", "assets", "avatars", "avatars.json"), "utf8")) as Array<{ file: string; label: string; kind?: string; gender: string; age_band: string }>;
    const personMeta = avatarMeta.filter((row) => row.kind !== "robot");
    const manifestText = await readFile(manifestPath, "utf8");
    const reportChecks = async (): Promise<void> => {
      const html = await readFile(reportPath, "utf8");
      expect([...html.matchAll(/src="(?!data:image\/jpeg;base64,)/g)].length).toBe(0);
      const faces = [...html.matchAll(/data-avatar="([^"]+)"/g)].map((match) => match[1]);
      expect(faces.length).toBe(seats.length);
      expect(new Set(faces).size).toBe(faces.length);
      const many = pickAvatars(personMeta.map((row, index) => ({ id: `seat-${index}`, gender: row.gender })), avatarMeta.map((row) => row.file), avatarMeta);
      expect(new Set(many.values()).size).toBe(31);
    };
    // N man seats, each with its own dossier, for the face-capacity rows.
    const manSeats = (count: number): Array<Record<string, unknown>> =>
      Array.from({ length: count }, (_, index) => ({ ...JSON.parse(manifestText).seats[index % 5], id: `man-${index}`, name: `Man Seat ${index}`, dossier: `dossiers/man-${index}.md`, gender: "man" }));
    const manDossiers = async (count: number, keep: boolean): Promise<void> => {
      for (let index = 0; index < count; index += 1) {
        const path = join(workspace, "dossiers", `man-${index}.md`);
        if (keep) await writeFile(path, dossier(`man-${index}`, `Man Seat ${index}`));
        else await rm(path, { force: true });
      }
    };
    const specialist = { ...JSON.parse(manifestText).seats[5], avatar: "avatar-02.jpg" };
    // Local server for the fetch-evidence rows: the tests never touch the real network.
    const server = createServer((request, response) => {
      if (request.url === "/page.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<html><head><title>Customer Review Thread</title><script>trackingPixel()</script></head><body><nav>Home</nav><p>We waited three weeks for a callback.</p><script>trackingPixel()</script></body></html>");
      } else if (request.url === "/notes.txt") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("Plain text review: setup took one afternoon.");
      } else if (request.url === "/odd.html") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html><body><p>Support answered on day two &#x110000;.</p><script >trackingPixel()</script ></body></html>");
      } else if (request.url === "/logo.png") {
        response.writeHead(200, { "content-type": "image/png" });
        response.end("png");
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const fetchWorkspace = join(caseRoot, "fetch-workspace");
    await mkdir(fetchWorkspace);
    let firstSource = "";
    const twoVersionArtifact = "# Two takes\n\nINTROROWMARKER intro line.\n\n## Version 1\n\nFirst take.\n\n## Version 2\n\nSecond take.\n";
    const guardRows: Array<{ name: string; script: string; args: string[]; writes: Array<[string, string]>; expected: string | null; before?: () => Promise<void>; check?: () => Promise<void> }> = [
      { name: "baseline", script: "validate-run.ts", args: [runDir], writes: [], expected: null },
      {
        name: "F1 quote absent from evidence/",
        script: "validate-panel.ts",
        args: [workspace],
        writes: [[buyerDossier, dossier(seats[0].id, seats[0].name).replace("- Evidence: ", '- Evidence: "we never trust a vendor demo" ')]],
        expected: "dossier-quote-unverified",
      },
      {
        name: "F2 SHIP over a specialist FLAG",
        script: "validate-run.ts",
        args: [runDir],
        writes: [[outcomePath, JSON.stringify({ ...outcome(), result: { ...(outcome().result as object), decision: "SHIP" } })]],
        expected: "cap-not-applied",
      },
      {
        name: "F3 spread does not match the reactions",
        script: "validate-run.ts",
        args: [runDir],
        writes: [[outcomePath, JSON.stringify({ ...outcome(), consensus: { spread: 7, agreement: 0.75 } })]],
        expected: "consensus-mismatch",
      },
      {
        name: "F4 unanimous YES without a pressed reaction",
        script: "validate-run.ts",
        args: [runDir],
        writes: [
          [hardNoReaction, reaction({ ...seats[4], fit: "core" })],
          [outcomePath, JSON.stringify({ ...outcome(), consensus: { spread: 0, agreement: 1 } })],
        ],
        expected: "unanimity-unpressed",
      },
      {
        name: "F5 dossier without a misfire section",
        script: "validate-panel.ts",
        args: [workspace],
        writes: [[buyerDossier, dossier(seats[0].id, seats[0].name).replace("## Where this composite misfires", "## Removed heading")]],
        expected: "Where this composite misfires",
      },
      {
        name: "S1 override names only a longer seat id containing the capping id",
        script: "validate-run.ts",
        args: [runDir],
        writes: [[outcomePath, JSON.stringify({ ...outcome(), result: { ...(outcome().result as object), decision: "SHIP", override: "implementation-specialist-2 accepted the risk" } })]],
        expected: "cap-not-applied",
      },
      {
        name: "F4 unanimous YES with a valid pressed reaction passes",
        script: "validate-run.ts",
        args: [runDir],
        writes: [
          [hardNoReaction, reaction({ ...seats[4], fit: "core" })],
          [join(runDir, "reactions", "economic-buyer.pressed.md"), reaction(seats[0])],
          [outcomePath, JSON.stringify(unanimousPressed)],
        ],
        expected: null,
      },
      { name: "R1 render a valid run: every image inlined, no shared default face", script: "render-report.ts", args: [runDir, "--out", reportPath], writes: [], expected: null, check: reportChecks },
      {
        name: "D1 each card holds its own seat's full dossier and a curated reaction with no SEAT_ID",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          const cards = [...html.matchAll(/<article class="seat(?: gate)?">[\s\S]*?<\/article>/g)].map((match) => match[0]);
          expect(cards.length).toBe(seats.length);
          const seedWord = (id: string): string => `${id.replace(/-/g, "")}0finding0`;
          // Gate cards render first, then the buyer cards in panel order.
          const ordered = [...seats.filter((seat) => seat.kind === "specialist"), ...seats.filter((seat) => seat.kind !== "specialist")];
          ordered.forEach((seat, index) => {
            for (const heading of REQUIRED_DOSSIER_HEADINGS) expect(cards[index]).toContain(`<h4>${heading}</h4>`);
            expect(cards[index]).toContain(seedWord(seat.id));
            for (const other of seats) if (other.id !== seat.id) expect(cards[index].includes(seedWord(other.id))).toBe(false);
          });
          expect(html.includes("<dt>SEAT_ID</dt>")).toBe(false);
        },
      },
      {
        name: "D2 a dossier symlinked outside the workspace is not read",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(caseRoot, "outside-dossier.md"), "# Outside\n\n## Panel role\n\nOUTSIDE-WORKSPACE-MARKER\n"]],
        expected: null,
        before: async () => {
          await rm(join(workspace, seats[1].dossier));
          await symlink(join(caseRoot, "outside-dossier.md"), join(workspace, seats[1].dossier));
        },
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await rm(join(workspace, seats[1].dossier));
          await writeFile(join(workspace, seats[1].dossier), dossier(seats[1].id, seats[1].name));
          expect(html.includes("OUTSIDE-WORKSPACE-MARKER")).toBe(false);
          expect(html).toContain("Dossier not available in this workspace.");
        },
      },
      {
        name: "C4 a shared-context run says so and never calls isolation operator-recorded",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        before: async () => {
          savedRun = await readFile(runPath, "utf8");
          await writeFile(runPath, JSON.stringify({ ...JSON.parse(savedRun), execution_mode: "sequential-shared-context" }));
        },
        check: async () => {
          await writeFile(runPath, savedRun);
          const html = await readFile(reportPath, "utf8");
          expect(html).toContain("Seats ran in one shared context, not isolated: One influencer reaction failed after a retry, so the synthesis excludes that seat.");
          expect(html.includes("operator-recorded")).toBe(false);
          expect(html).toContain("5 active seats of 6 expected.");
        },
      },
      {
        name: "C6 dossier prose renders inline code, a wrapped bullet as one item, and a numbered list",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[buyerDossier, `${dossier(seats[0].id, seats[0].name)}\n## Notes\n\nUse the \`ledger-key\` field.\n\n- wrapped bullet head\n  wrapped bullet tail\n- second bullet\n\n1. step one\n2. step two\n`]],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          expect(html).toContain("<code>ledger-key</code>");
          expect(html).toContain("<li>wrapped bullet head wrapped bullet tail</li><li>second bullet</li>");
          expect(html).toContain("<ol><li>step one</li><li>step two</li></ol>");
        },
      },
      {
        name: "R3 render without --out writes <run-dir>/REPORT.html",
        script: "render-report.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          expect(await readFile(join(runDir, "REPORT.html"), "utf8")).toContain("<!doctype html>");
          await rm(join(runDir, "REPORT.html"));
        },
      },
      {
        name: "R4 two seats with the same explicit avatar get different faces",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const picked = pickAvatars([{ id: "a", gender: "woman", avatar: "avatar-03.jpg" }, { id: "b", gender: "woman", avatar: "avatar-03.jpg" }], ["avatar-01.jpg", "avatar-02.jpg", "avatar-03.jpg"], avatarMeta);
          expect(picked.get("a")).toBe("avatar-03.jpg");
          expect(picked.get("b") === "avatar-03.jpg").toBe(false);
        },
      },
      {
        name: "G1 gendered seats get a face of their gender (and band); a seat with none gets any unused face",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const files = avatarMeta.map((row) => row.file).sort();
          const genderOf = new Map(avatarMeta.map((row) => [row.file, row]));
          const faceSeats = [{ id: "ana", gender: "woman" }, { id: "ben", gender: "man" }, { id: "cora", gender: "woman", age_band: "60s" }, { id: "gate" }];
          const picked = pickAvatars(faceSeats, files, avatarMeta);
          expect(genderOf.get(picked.get("ana")!)?.gender).toBe("woman");
          expect(genderOf.get(picked.get("ben")!)?.gender).toBe("man");
          expect(genderOf.get(picked.get("cora")!)?.label).toBe("woman, 60s");
          expect(new Set(picked.values()).size).toBe(4);
        },
      },
      {
        name: "G3 validate-panel refuses a buyer seat with no gender",
        script: "validate-panel.ts",
        args: [workspace],
        writes: [[manifestPath, JSON.stringify({ ...JSON.parse(manifestText), seats: JSON.parse(manifestText).seats.map((seat: object, index: number) => (index === 0 ? { ...seat, gender: undefined } : seat)) })]],
        expected: "missing-seat-gender",
        check: async () => {
          await writeFile(manifestPath, manifestText);
        },
      },
      {
        name: "G2 validate-panel refuses a seat gender outside woman/man",
        script: "validate-panel.ts",
        args: [workspace],
        writes: [[manifestPath, JSON.stringify({ ...JSON.parse(manifestText), seats: JSON.parse(manifestText).seats.map((seat: object, index: number) => (index === 0 ? { ...seat, gender: "female" } : seat)) })]],
        expected: "bad-seat-gender",
        check: async () => {
          await writeFile(manifestPath, manifestText);
        },
      },
      {
        name: "G4 two gender-less seats get two different faces",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const picked = pickAvatars([{ id: "p1" }, { id: "p2" }], avatarMeta.map((row) => row.file).sort(), avatarMeta);
          expect(new Set(picked.values()).size).toBe(2);
        },
      },
      {
        name: "G12 avatars.json ships 17 woman, 14 man and 3 robot faces, and avatar-26 is a man",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const count = (pick: (row: { gender?: string; kind?: string }) => boolean) => avatarMeta.filter(pick).length;
          expect(`${count((row) => row.gender === "woman")}/${count((row) => row.gender === "man")}/${count((row) => row.kind === "robot")}`).toBe("17/14/3");
          expect(avatarMeta.find((row) => row.file === "avatar-26.jpg")?.gender).toBe("man");
        },
      },
      {
        name: "G6 a 10-seat panel gets 10 distinct faces, each declared seat matching its gender",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const genderOf = new Map(avatarMeta.map((row) => [row.file, row.gender]));
          const tenSeats: Array<{ id: string; gender?: string }> = [...Array.from({ length: 5 }, (_, index) => ({ id: `w${index}`, gender: "woman" })), ...Array.from({ length: 4 }, (_, index) => ({ id: `m${index}`, gender: "man" })), { id: "gate" }];
          const picked = pickAvatars(tenSeats, avatarMeta.map((row) => row.file).sort(), avatarMeta);
          expect(new Set(picked.values()).size).toBe(10);
          for (const seat of tenSeats) if (seat.gender) expect(`${seat.id}:${genderOf.get(picked.get(seat.id)!)}`).toBe(`${seat.id}:${seat.gender}`);
        },
      },
      {
        name: "G7 15 man seats only warn not-enough-faces: the panel stays valid because photos can cover them",
        script: "validate-panel.ts",
        args: [workspace],
        writes: [[manifestPath, JSON.stringify({ ...JSON.parse(manifestText), seats: manSeats(15) })]],
        expected: null,
        before: async () => manDossiers(15, true),
        check: async () => {
          expect((await runScript("validate-panel.ts", [workspace])).stdout).toMatch(/WARNING not-enough-faces.*panel needs 15 man faces/);
          await writeFile(manifestPath, manifestText);
          await manDossiers(15, false);
        },
      },
      {
        name: "G9 a gender-less specialist placed before 14 man seats leaves every man face to them: 15 distinct faces, no throw",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const genderOf = new Map(avatarMeta.map((row) => [row.file, row.gender]));
          // implementation-specialist hashes onto a man face (avatar-04), so a panel-order pick would starve the last man seat.
          const panel = [{ id: "implementation-specialist" }, ...Array.from({ length: 14 }, (_, index) => ({ id: `m${index}`, gender: "man" }))];
          const picked = pickAvatars(panel, avatarMeta.map((row) => row.file).sort(), avatarMeta);
          expect(new Set(picked.values()).size).toBe(15);
          for (const seat of panel.slice(1)) expect(`${seat.id}:${genderOf.get(picked.get(seat.id)!)}`).toBe(`${seat.id}:man`);
        },
      },
      {
        name: "G10 a specialist holding a man avatar plus 14 man seats: validate-panel warns the avatar is ignored, not short of man faces; the specialist gets a robot",
        script: "validate-panel.ts",
        args: [workspace],
        writes: [[manifestPath, JSON.stringify({ ...JSON.parse(manifestText), seats: [specialist, ...manSeats(14)] })]],
        expected: null,
        before: async () => manDossiers(14, true),
        check: async () => {
          const out = (await runScript("validate-panel.ts", [workspace])).stdout;
          expect(out).toMatch(/WARNING avatar-kind-mismatch/);
          expect(out.includes("not-enough-faces")).toBe(false);
          await writeFile(manifestPath, manifestText);
          await manDossiers(14, false);
          const genderOf = new Map(avatarMeta.map((row) => [row.file, row.gender]));
          const panel = [{ id: "gate", kind: "specialist", avatar: "avatar-02.jpg" }, ...Array.from({ length: 14 }, (_, index) => ({ id: `m${index}`, gender: "man" }))];
          const picked = pickAvatars(panel, avatarMeta.map((row) => row.file).sort(), avatarMeta);
          expect(new Set(picked.values()).size).toBe(15);
          expect(picked.get("gate")).toMatch(/^robot-0\d\.jpg$/);
          for (const seat of panel.slice(1)) expect(`${seat.id}:${genderOf.get(picked.get(seat.id)!)}`).toBe(`${seat.id}:man`);
        },
      },
      {
        name: "G11 a run with 15 man seats, each with a report-img photo, loads with no default face used",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const photoRun = join(caseRoot, "photo-run");
          await mkdir(join(photoRun, "report-img"), { recursive: true });
          const photoSeats = manSeats(15);
          await writeFile(join(photoRun, "panel-snapshot.json"), JSON.stringify({ seats: photoSeats }));
          await writeFile(join(photoRun, "OUTCOME.json"), "{}");
          const photo = await readFile(join(SCRIPT_ROOT, "..", "assets", "avatars", "avatar-02.jpg"));
          for (const seat of photoSeats) await writeFile(join(photoRun, "report-img", `${seat.id}.jpg`), photo);
          const run = await loadRun(photoRun, "G11");
          for (const seat of photoSeats) expect((await run.imageFor(seat.id as string))[0]).toBe(`report-img/${seat.id}.jpg`);
        },
      },
      {
        name: "G8 pickAvatars throws rather than repeat when the pool is exhausted",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const men = Array.from({ length: 15 }, (_, index) => ({ id: `m${index}`, gender: "man" }));
          let message = "no throw";
          try {
            pickAvatars(men, avatarMeta.map((row) => row.file).sort(), avatarMeta);
          } catch (error) {
            message = String(error);
          }
          expect(message).toContain("report-img");
        },
      },
      {
        name: "G5 a man seat with an explicit woman avatar gets a man's face, and validate-panel refuses it",
        script: "validate-panel.ts",
        args: [workspace],
        writes: [[manifestPath, JSON.stringify({ ...JSON.parse(manifestText), seats: JSON.parse(manifestText).seats.map((seat: object, index: number) => (index === 1 ? { ...seat, avatar: "avatar-01.jpg" } : seat)) })]],
        expected: "avatar-gender-mismatch",
        check: async () => {
          await writeFile(manifestPath, manifestText);
          const genderOf = new Map(avatarMeta.map((row) => [row.file, row.gender]));
          const picked = pickAvatars([{ id: "ben", gender: "man", avatar: "avatar-01.jpg" }], avatarMeta.map((row) => row.file).sort(), avatarMeta);
          expect(genderOf.get(picked.get("ben")!)).toBe("man");
        },
      },
      {
        name: "R6 every rendered default face carries its seat's declared gender",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          const genderOf = new Map(avatarMeta.map((row) => [row.file, row.gender]));
          const seatGender = new Map(seats.map((seat) => [seat.id, seat.gender]));
          const faces = [...html.matchAll(/data-avatar="([^"]+)"[^>]*alt="Illustrative composite for ([^"]+)"/g)];
          expect(faces.length).toBe(seats.length);
          for (const [, file, seatId] of faces) expect(`${seatId}:${genderOf.get(file)}`).toBe(`${seatId}:${seatGender.get(seatId) ?? genderOf.get(file)}`);
        },
      },
      {
        name: "H1 REPORT-COPY headline and headings replace the generic ones; an empty heading falls back",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, "REPORT-COPY.json"), JSON.stringify({ headline: "Fixture answer-first headline.", headings: { vote: "Copy vote heading", score: "" } })]],
        expected: null,
        check: async () => {
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
          const html = await readFile(reportPath, "utf8");
          expect(html).toContain("<h1>Fixture answer-first headline.</h1>");
          expect(html).toContain(`<h2 class="sec">Copy vote heading</h2>`);
          expect(html).toContain(`<h2 class="sec">Scorecard</h2>`);
          expect(html).toContain(`<h2 class="sec">What the panel read</h2>`);
          expect(html).toContain("We help operations teams find one controlled workflow improvement.");
          expect(html).toContain("<li>The ask: Assess whether qualified operations buyers would request a scoped workflow review.</li>");
          expect(html.includes(`<p class="more">`)).toBe(false);
        },
      },
      {
        name: "H4 headline_em wraps its first occurrence in <em>; a non-substring warns and is ignored",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, "REPORT-COPY.json"), JSON.stringify({ headline: "Fixture answer-first headline.", headline_em: "answer-first" })]],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await writeFile(join(runDir, "REPORT-COPY.json"), JSON.stringify({ headline: "Fixture answer-first headline.", headline_em: "not in it" }));
          const missed = await runScript("render-report.ts", [runDir, "--out", reportPath]);
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
          expect(html).toContain("<h1>Fixture <em>answer-first</em> headline.</h1>");
          expect(missed.stderr).toContain("headline_em is not a substring");
          expect(await readFile(reportPath, "utf8")).toContain("<h1>Fixture answer-first headline.</h1>");
        },
      },
      {
        name: "H5 version bars and N-to-M when every buyer reaction opens VERSION:, YES/NO bars when one does not",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        before: async () => {
          const votes: Record<string, string> = { "economic-buyer": "2", "daily-user": "2", "skeptical-operator": "1", "principled-hard-no": "NEITHER" };
          for (const seat of seats) if (votes[seat.id]) await writeFile(join(runDir, "reactions", `${seat.id}.md`), reaction(seat).replace("REACTION: ", `REACTION: VERSION: ${votes[seat.id]}. `));
        },
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await writeFile(join(runDir, "reactions", "economic-buyer.md"), reaction(seats[0]));
          const mixed = await runScript("render-report.ts", [runDir, "--out", reportPath]);
          const yesNo = await readFile(reportPath, "utf8");
          // referral-influencer is the fixture's failed seat and has no reaction to restore.
          for (const seat of seats.slice(0, 5)) if (seat.id !== "referral-influencer") await writeFile(join(runDir, "reactions", `${seat.id}.md`), reaction(seat));
          expect(html).toContain(`<div class="num">2<small> to 1</small></div>`);
          expect(html).toContain(`<span class="seg" style="flex:2;background:var(--v2)">2 Version 2</span>`);
          expect(html).toContain("<th>Version</th>");
          expect(mixed.code).toBe(0);
          expect(yesNo.includes(`<div class="big">`)).toBe(false);
          expect(yesNo).toContain(`<span class="seg yes"`);
        },
      },
      {
        name: "H6 change_titles and dissent_topics render; a missing entry falls back",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [
          [join(runDir, "REPORT-COPY.json"), JSON.stringify({ change_titles: ["Fixture change title"], dissent_topics: ["FIXTURE TOPIC"] })],
          [join(runDir, "SYNTHESIS.md"), `${synthesisMarkdown()}\n\n## Three smallest useful changes\n\n1. First change.\n2. Second change.\n`],
        ],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await writeFile(join(runDir, "REPORT-COPY.json"), JSON.stringify({ dissent_topics: [] }));
          const fallback = await runScript("render-report.ts", [runDir, "--out", reportPath]);
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
          await writeFile(join(runDir, "SYNTHESIS.md"), synthesisMarkdown());
          expect(html).toContain(`<span class="k">1</span><h3>Fixture change title</h3><p>First change.</p>`);
          expect(html).toContain(`<span class="k">2</span><p>Second change.</p>`);
          expect(html).toContain("D1 · FIXTURE TOPIC");
          expect(fallback.code).toBe(0);
          expect(await readFile(reportPath, "utf8")).toContain("D1 · DECISION");
        },
      },
      {
        name: "F1 a specialist seat gets a robot face and no buyer seat ever does",
        script: "validate-run.ts",
        args: [runDir],
        writes: [],
        expected: null,
        check: async () => {
          const robots = new Set(avatarMeta.filter((row) => row.kind === "robot").map((row) => row.file));
          const panel = [{ id: "gate", kind: "specialist", gender: "man" }, ...personMeta.map((row, index) => ({ id: `b${index}`, kind: "buyer", gender: row.gender }))];
          const picked = pickAvatars(panel, avatarMeta.map((row) => row.file).sort(), avatarMeta);
          expect(robots.has(picked.get("gate")!)).toBe(true);
          expect(panel.slice(1).filter((seat) => robots.has(picked.get(seat.id)!)).length).toBe(0);
        },
      },
      {
        name: "F2 the gate card is full-width, first in the Panel grid, and carries the explanation line",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          const grid = html.slice(html.indexOf("<div class=\"grid\">"));
          expect(grid.indexOf("<article class=\"seat gate\">")).toBe(grid.indexOf("<article"));
          expect(html).toContain(".seat.gate{grid-column:1/-1;");
          expect(grid).toMatch(/<article class="seat gate"><div class="portrait"><img data-avatar="robot-0\d\.jpg"/);
          expect(grid).toContain("Panel overview, not a buyer. It answers passed or needs fixes instead of YES or NO, and needs fixes caps the verdict.");
          expect(grid).toMatch(/This run: needs fixes → verdict [A-Z-]+\./);
        },
      },
      {
        name: "F2b a FLAG specialist reads \"Overview: needs fixes\" in its badge and table row, and no reader text says GATE",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          expect(html).toContain('<span class="badge gate">Overview: needs fixes</span>');
          expect(html).toContain("<td>Overview: needs fixes</td>");
          const text = html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ");
          expect(/\bGATE\b/.test(text)).toBe(false);
        },
      },
      {
        name: "F3 a version run keeps a YES/NO line under every bar; labels 1.1 and 1.2 stay distinct",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        before: async () => {
          const votes: Record<string, string> = { "economic-buyer": "1.1", "daily-user": "1.2", "skeptical-operator": "1.1", "principled-hard-no": "NEITHER" };
          for (const seat of seats) if (votes[seat.id]) await writeFile(join(runDir, "reactions", `${seat.id}.md`), reaction(seat).replace("REACTION: ", `REACTION: VERSION: ${votes[seat.id]}. `));
        },
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          for (const seat of seats.slice(0, 5)) if (seat.id !== "referral-influencer") await writeFile(join(runDir, "reactions", `${seat.id}.md`), reaction(seat));
          expect(html).toContain(`<div class="num">2<small> to 1</small></div>`);
          expect(html).toContain("2 Version 1.1</span>");
          expect(html).toContain("1 Version 1.2</span>");
          expect(html.match(/<small class="yn">YES \d+ · NO \d+<\/small>/g)?.length).toBe(1 + (html.match(/<div class="vbar"/g)?.length ?? 0));
        },
      },
      {
        name: "F4 an all-Neither version run says how many chose Neither, never 0 to 0",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        before: async () => {
          const votes: Record<string, string> = { "economic-buyer": "NEITHER", "daily-user": "NEITHER", "skeptical-operator": "NEITHER", "principled-hard-no": "NEITHER" };
          for (const seat of seats) if (votes[seat.id]) await writeFile(join(runDir, "reactions", `${seat.id}.md`), reaction(seat).replace("REACTION: ", `REACTION: VERSION: ${votes[seat.id]}. `));
        },
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          for (const seat of seats.slice(0, 5)) if (seat.id !== "referral-influencer") await writeFile(join(runDir, "reactions", `${seat.id}.md`), reaction(seat));
          expect(html).toContain(`<div class="num">4<small> Neither</small></div>`);
          expect(html.includes("0<small> to 0")).toBe(false);
        },
      },
      {
        name: "F5 a dissent card with a topic still names its field",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, "REPORT-COPY.json"), JSON.stringify({ dissent_topics: ["FIXTURE TOPIC"] })]],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
          expect(html).toContain("D1 · FIXTURE TOPIC · DECISION</span>");
        },
      },
      {
        name: "H7 the sticky tab bar links each rendered section id and none for an absent section",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          const tabs = [...html.matchAll(/<a href="#([a-z]+)">/g)].map((match) => match[1]);
          expect(tabs.join(",")).toBe("room,vote,score,dissent,artifact,method,limitations,next");
          for (const id of tabs) expect(html).toContain(`id="${id}"`);
        },
      },
      {
        name: "V1 with no REPORT-COPY: four computed tiles, one seat-table row per answering seat with the RESISTS fallback, and the run id in the Next band",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [],
        expected: null,
        before: async () => {
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
        },
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          const tiles = [...html.matchAll(/<div class="stat"><b>([^<]*)<\/b><span>([^<]*)<\/span><\/div>/g)].map((match) => `${match[1]} | ${match[2]}`);
          expect(tiles.join("; ")).toBe("3 of 3 | core buyers YES; 3 to 1 | YES vs NO, all buyer seats; 5 | seats read alone (unverified); needs fixes | Riley Morgan overview");
          const rows = [...html.matchAll(/<tr><td>([^<]*)<\/td>(?:<td>[^<]*<\/td>){3}<td>([^<]*)<\/td><\/tr>/g)];
          expect(rows.map((match) => match[1]).join(",")).toBe(seats.filter((seat) => seat.id !== "referral-influencer").map((seat) => seat.id).join(","));
          expect(rows[0][2]).toBe("The evidence remains directional and needs a real-world check.");
          expect(html).toContain("<td>Overview: needs fixes</td><td>n/a</td>");
          expect(html).toContain(`<p class="small">Run ${basename(runDir)} · room `);
        },
      },
      {
        name: "V2 REPORT-COPY tiles and seats.<id>.stops render verbatim; invalid tiles fall back",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, "REPORT-COPY.json"), JSON.stringify({ question: "Fixture question?", summary: "Fixture summary.", tiles: [{ value: "9 of 9", label: "copy tile" }], seats: { "economic-buyer": { stops: "Copy stops text." } } })]],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
          expect(html).toContain(`<div class="stats"><div class="stat"><b>9 of 9</b><span>copy tile</span></div></div>`);
          expect(html).toContain(`<p class="q">Fixture question?</p>`);
          expect(html).toContain(`<p class="why">Fixture summary.</p>`);
          expect(html).toContain("<td>Copy stops text.</td>");
          await writeFile(join(runDir, "REPORT-COPY.json"), JSON.stringify({ tiles: "four" }));
          const invalid = await runScript("render-report.ts", [runDir, "--out", reportPath]);
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
          expect(invalid.code).toBe(0);
          expect(invalid.stderr).toContain("tiles is not");
          expect(await readFile(reportPath, "utf8")).toContain("<b>3 of 3</b>");
        },
      },
      {
        name: "H2 the changes section renders from a SYNTHESIS.md smallest-useful-changes section and is absent without one",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, "SYNTHESIS.md"), `${synthesisMarkdown()}\n\n## Three smallest useful changes\n\n1. Name the CHANGESROWMARKER step.\n`]],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await writeFile(join(runDir, "SYNTHESIS.md"), synthesisMarkdown());
          expect(html).toContain("What it still needs");
          expect(html).toContain(`<div class="fix"><span class="k">1</span><p>Name the CHANGESROWMARKER step.</p>`);
          await writeFile(join(runDir, "SYNTHESIS.md"), `${synthesisMarkdown()}\n\n## Three smallest useful changes\n\nINTROMARKER before the list.\n\n1. Name the CHANGESROWMARKER step.\n\nCLOSINGMARKER after the list.\n`);
          expect((await runScript("render-report.ts", [runDir, "--out", reportPath])).code).toBe(0);
          const mixed = await readFile(reportPath, "utf8");
          await writeFile(join(runDir, "SYNTHESIS.md"), synthesisMarkdown());
          expect(mixed.includes(`<div class="fix">`)).toBe(false);
          expect(mixed).toContain("INTROMARKER before the list.");
          expect(mixed).toContain("CLOSINGMARKER after the list.");
          expect((await runScript("render-report.ts", [runDir, "--out", reportPath])).code).toBe(0);
          expect((await readFile(reportPath, "utf8")).includes("What it still needs")).toBe(false);
        },
      },
      {
        name: "B1 numbered changes get one Apply all fixes and one Apply this fix per card, each prompt naming the run and its change verbatim; prose changes get no buttons",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, "SYNTHESIS.md"), `${synthesisMarkdown()}\n\n## Three smallest useful changes\n\n1. Say "BTNONE" & <keep> it.\n2. Name the BTNTWO step\n`]],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          await writeFile(join(runDir, "SYNTHESIS.md"), synthesisMarkdown());
          const prompts = [...html.matchAll(/<button class="fixbtn" type="button" data-prompt="([^"]*)">([^<]*)<\/button>/g)]
            .map((m) => [m[2], m[1].replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))]);
          const runId = JSON.parse(await readFile(join(runDir, "RUN.json"), "utf8")).run_id;
          expect(prompts.map((p) => p[0]).join("|")).toBe("Apply all fixes|Apply this fix|Apply this fix");
          expect(prompts.every((p) => p[1].includes(`Run: ${runId}.`) && p[1].includes(`compare it with run ${runId}.`))).toBe(true);
          expect(prompts[0][1]).toContain(`in this order, to the artifact, and keep everything else unchanged:\n1. Say "BTNONE" & <keep> it.\n2. Name the BTNTWO step\nMake one variant (not three)`);
          expect(prompts[1][1]).toContain(`Apply only this change to the artifact, and keep everything else unchanged: 1. Say "BTNONE" & <keep> it. Make one variant`);
          expect(prompts[2][1]).toContain(`unchanged: 2. Name the BTNTWO step. Make one variant`);
          await writeFile(join(runDir, "SYNTHESIS.md"), `${synthesisMarkdown()}\n\n## Three smallest useful changes\n\nProse only, BTNPROSE.\n`);
          expect((await runScript("render-report.ts", [runDir, "--out", reportPath])).code).toBe(0);
          const prose = await readFile(reportPath, "utf8");
          await writeFile(join(runDir, "SYNTHESIS.md"), synthesisMarkdown());
          expect(prose).toContain("BTNPROSE");
          expect(prose.includes("data-prompt=")).toBe(false);
        },
      },
      {
        name: "H3 a two-version artifact shows its title and intro once, above the two columns",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, run.artifact_file), twoVersionArtifact]],
        expected: null,
        before: async () => {
          savedRun = await readFile(runPath, "utf8");
          await writeFile(runPath, JSON.stringify({ ...JSON.parse(savedRun), artifact_sha256: createHash("sha256").update(twoVersionArtifact).digest("hex") }));
        },
        check: async () => {
          await writeFile(join(runDir, run.artifact_file), copiedArtifact);
          await writeFile(runPath, savedRun);
          const html = await readFile(reportPath, "utf8");
          expect(html.split("INTROROWMARKER").length - 1).toBe(1);
          expect(html.indexOf("INTROROWMARKER") < html.indexOf(`<div class="versions">`)).toBe(true);
          expect(html).toContain("<summary>Version 1</summary>");
          expect(html).toContain("<summary>Version 2</summary>");
        },
      },
      {
        name: "R5 a REPORT-COPY quote absent from the reaction falls back to LANDS",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[join(runDir, "REPORT-COPY.json"), JSON.stringify({ seats: { "economic-buyer": { quote: "We would sign this today." } } })]],
        expected: null,
        check: async () => {
          const html = await readFile(reportPath, "utf8");
          expect(html.includes("We would sign this today.")).toBe(false);
          expect(html).toContain("The constrained workflow language names a concrete operational outcome.");
        },
      },
      {
        name: "R2 render refuses a run that fails validate-run",
        script: "render-report.ts",
        args: [runDir, "--out", reportPath],
        writes: [[outcomePath, JSON.stringify({ ...outcome(), consensus: { spread: 7, agreement: 0.75 } })]],
        expected: "refused",
        // R5's REPORT-COPY.json is removed here so a failing R5 cannot leave it behind for this row.
        before: async () => {
          await rm(join(runDir, "REPORT-COPY.json"), { force: true });
          await rm(reportPath, { force: true });
        },
        check: async () => {
          expect(await readFile(reportPath, "utf8").then(() => true, () => false)).toBe(false);
        },
      },
      {
        name: "E1 fetch-evidence writes S001/S002, records the 404, strips script text",
        script: "fetch-evidence.ts",
        args: [fetchWorkspace, join(caseRoot, "urls-a.txt")],
        writes: [[join(caseRoot, "urls-a.txt"), `# fixture list\n${origin}/page.html\n\n${origin}/notes.txt\n${origin}/missing\n`]],
        expected: null,
        check: async () => {
          const sources = join(fetchWorkspace, "evidence", "sources");
          const html = await readFile(join(sources, "S001.md"), "utf8");
          expect(html).toContain("title: Customer Review Thread");
          expect(html).toContain("We waited three weeks for a callback.");
          expect(html).not.toContain("trackingPixel");
          expect(await readFile(join(sources, "S002.md"), "utf8")).toContain("Plain text review: setup took one afternoon.");
          const index = await readFile(join(fetchWorkspace, "evidence", "SOURCES.md"), "utf8");
          expect(index).toContain("| S002 |");
          expect(index).toContain(`${origin}/missing: HTTP 404`);
        },
      },
      {
        name: "E2 a rerun appends S003 and leaves S001 untouched",
        script: "fetch-evidence.ts",
        args: [fetchWorkspace, join(caseRoot, "urls-b.txt")],
        writes: [[join(caseRoot, "urls-b.txt"), `${origin}/notes.txt\n`]],
        expected: null,
        before: async () => {
          firstSource = await readFile(join(fetchWorkspace, "evidence", "sources", "S001.md"), "utf8");
        },
        check: async () => {
          const sources = join(fetchWorkspace, "evidence", "sources");
          expect(await readFile(join(sources, "S001.md"), "utf8")).toBe(firstSource);
          expect(await readFile(join(sources, "S003.md"), "utf8")).toContain("id: S003");
        },
      },
      {
        name: "E3 a list with only a 404 exits 1",
        script: "fetch-evidence.ts",
        args: [fetchWorkspace, join(caseRoot, "urls-c.txt")],
        writes: [[join(caseRoot, "urls-c.txt"), `${origin}/missing\n`]],
        expected: "HTTP 404",
        check: async () => {
          const index = await readFile(join(fetchWorkspace, "evidence", "SOURCES.md"), "utf8");
          expect(index).toContain("| S001 |");
          expect(index).toContain("| S003 |");
          expect(index).toContain(`- ${origin}/missing: HTTP 404`);
        },
      },
      {
        name: "E4 a spaced closing tag and an out-of-range entity neither leak script text nor abort",
        script: "fetch-evidence.ts",
        args: [fetchWorkspace, join(caseRoot, "urls-d.txt")],
        writes: [[join(caseRoot, "urls-d.txt"), `${origin}/odd.html\n`]],
        expected: null,
        check: async () => {
          const saved = await readFile(join(fetchWorkspace, "evidence", "sources", "S004.md"), "utf8");
          expect(saved).toContain("Support answered on day two �.");
          expect(saved).not.toContain("trackingPixel");
        },
      },
      {
        name: "E5 a non-text content type is recorded as skipped",
        script: "fetch-evidence.ts",
        args: [fetchWorkspace, join(caseRoot, "urls-e.txt")],
        writes: [[join(caseRoot, "urls-e.txt"), `${origin}/logo.png\n`]],
        expected: "SKIPPED",
        check: async () => {
          expect(await readFile(join(fetchWorkspace, "evidence", "SOURCES.md"), "utf8")).toContain(`- ${origin}/logo.png: skipped: image/png`);
        },
      },
    ];
    try {
      for (const row of guardRows) {
        for (const [path, content] of row.writes) await writeFile(path, content);
        await row.before?.();
        const result = await runScript(row.script, row.args);
        if (row.expected === null) {
          expect(result.code).toBe(0);
        } else {
          expect(result.code).toBe(1);
          expect(`${result.stdout}${result.stderr}`).toContain(row.expected);
        }
        await row.check?.();
        await writeFile(buyerDossier, dossier(seats[0].id, seats[0].name));
        await writeFile(hardNoReaction, reaction(seats[4]));
        await writeFile(outcomePath, JSON.stringify(outcome()));
      }
    } finally {
      server.close(); // a failing row must not leave the listener holding the process open
    }
  });
});
