# AI Marketing Panel

## What this is

A synthetic customer panel is a room full of researched stand-ins for your
actual customers. You describe a real decision — should this landing page go
live, does this price make sense, will this email get opened — and the kit
builds five to fifteen distinct customer composites from evidence you already
have: support tickets, sales calls, reviews, the things people actually say
when they turn you down. Each composite gets a long, sourced dossier, and then
each one reads your draft alone, in its own context, without seeing what any of
the others said. You get back their separate reactions, an honest synthesis
that keeps the disagreements intact, and a scored verdict you can argue with.

It is for the owner or the small team who writes their own copy and has nobody
to show it to before it ships. Commissioned focus groups cost real money and
take weeks, so most small businesses skip the test entirely and go on instinct.
This gives your own people a way to pressure-test their work first — the
marketer, the owner, the person who wrote the page keeps writing it, and gets a
structured critique before customers see it instead of after. It is directional
evidence, not customers, and the kit says so everywhere it matters.

Maintained by rTech Digital Consulting (https://rtech-consulting.com)

Hosted install and tuning available.

## About this kit

A portable, audience-neutral implementation of the synthetic focus-group
workflow demonstrated in Corey Ganim's interview with Justin Brooke.

This is the reusable base kit. Do not run it in place. Make an owned copy for
each use, evolve that copy through real work, and promote only validated
general improvements back here.

## What the kit does

1. Defines the decision and customer evidence.
2. Builds an explicit panel of 5-15 customer composites.
3. Produces one rich, evidence-labeled dossier per seat.
4. Runs each seat independently against the same artifact.
5. Synthesizes reactions without erasing dissent.
6. Scores the artifact with owner-approved weights.
7. Produces three rewrites and retests when useful.
8. Records predictions and later actual outcomes for calibration.

The quality of the dossiers is the product. Prompts alone are not a panel.

## Why this gets run instead of skipped

A real focus group is a research project: recruiting the right customers,
scheduling them, moderating, and writing it up. Because that is expensive, most
small businesses skip it entirely and ship on instinct.

The comparison, stated honestly:

| | Commissioned focus group | This kit |
| --- | --- | --- |
| Cost | roughly $20,000 and up | a few dollars of model usage |
| Turnaround | weeks | about ten minutes |
| What you get | real customers | researched composites |

**Both figures are unmeasured estimates, not measured results.** The
$20,000 figure is the order of magnitude for a commissioned focus group and
moves a lot by scope and market. The per-run cost varies with the model you
use, how many seats are active, and how long the artifact is — a fifteen-seat
wash on a frontier model costs meaningfully more than a five-seat wash on a
cheap one, and running the same artifact through five rooms costs five times.
Anyone quoting these to a client should price their own run first.

The honest part of the comparison is the last row, and it does not favor the
kit: these are composites, not customers. What the kit buys is the ability to
run the test at all, at a price where testing every artifact is a reasonable
habit rather than a budget decision. It is directional evidence and it does not
replace real customer contact — see the honest claim at the bottom of this file.

Rooms are what make that habit practical: the panel is built once, and `clean`
resets it for the next artifact in seconds, with several named rooms running in
parallel at T1 (sequentially at T2 — see the tier ladder below). See
`skills/synthetic-customer-panel/workflows/room-lifecycle.md`.

## Install per harness

| Harness | Install | Status |
| --- | --- | --- |
| **Claude app** | Drag-and-drop the kit zip into the conversation. | VERIFIED working 2026-08-12 |
| **Codex** | Unzip the kit to a folder, then point Codex at that folder. | VERIFIED working 2026-08-12 |
| **claude.ai web** | Presumed zip upload, same as the app. | **UNVERIFIED** — never tested. |

The web row stays UNVERIFIED until a human actually runs it. When somebody
does, this row changes and `CHANGELOG.md` records who and when.

## Capability tier ladder

This kit is written against **T1** and degrades to T2 and T3 on announcement,
never silently. Every run records the tier it actually ran at in `RUN.json`.

**T1 — full** (subagents + workflow orchestration; Claude Code today). Seats
run as **subagents running workflows**, one subagent per seat, at most seven
per wave. Parallel rooms, full `room.sh` lifecycle, deterministic validators,
isolated per-seat execution. Mode `isolated-parallel`. This is the tier the
headline claims above are written against.

**T2 — shell-only** (can execute scripts, cannot orchestrate subagents).
`room.sh`, the room lifecycle, and the validators all work. Seats run
**sequentially in separate fresh contexts** — mode `isolated-sequential`. This
is a full-fidelity run, not a degraded one; what is lost is wall-clock time and
cross-seat isolation strength, and the run is labeled `isolated-sequential`
rather than parallel.

**T3 — chat-only** (no shell; claude.ai web, ChatGPT). The kit degrades to
prompts and templates: every deterministic script becomes a manual checklist
walked by hand. **What is LOST at T3:** script-enforced gates become advisory;
`validate-panel` / `prepare-run` / `validate-run` become self-report instead of
verdicts; `room.sh` archiving becomes manual file hygiene; the
"the script decides, not the AI" guarantee is downgraded to a convention; and
if contexts cannot be isolated at all the run is `sequential-shared-context`
and is labeled degraded. Seats are still run one at a time from the task
templates, each reaction frozen before the next dossier is loaded.

### T2 dependency floor

- `skills/synthetic-customer-panel/scripts/room.sh` is the floor: bash and
  coreutils only, no jq, no Python, no Node, no install step. It parses on
  Apple's stock bash 3.2.
- **Node 22.18.0+ is a stated T2 REQUIREMENT for the panel validators.**
  `init-panel.ts`, `validate-panel.ts`, `prepare-run.ts`, `validate-run.ts`,
  and `verify-install.ts` are TypeScript and are invoked with plain `node`,
  which runs them directly — no flags, build step, bundler, or `npm install`.

  Check the floor with the kit's own preflight, which needs only bash and
  prints the upgrade action for your system if you are short:

  ```
  bash skills/synthetic-customer-panel/scripts/check-node.sh
  ```

  **If you are on Node 22.6–22.17 you are BELOW this floor and must upgrade.**
  Node 22.6 was this kit's floor through release 1.2.1; 1.2.2 raised it because
  Node only reads the kit's TypeScript without a flag from 22.18.0 up. Below
  22.18.0 the validators stop with a syntax error rather than running. Install
  the current LTS from https://nodejs.org/en/download — on macOS with Homebrew,
  `brew install node`; on Linux, your distribution's Node packages.

  Without Node at or above the floor the room lifecycle still works
  (`room.sh` needs only bash), but panel and run validation drops to the T3
  self-report path, and a self-reported panel is labeled as such.

## Package

- `START-HERE.md` — first handoff file.
- `INSTALL.md` — canonical agent-executed installation contract.
- `kit.json` — declared requirements, payloads, boundaries, and verification.
- `kit.schema.json` — standalone manifest schema.
- `VERSION` — source-of-truth package version.
- `CHANGELOG.md` — released PoC changes.
- `installer.md` — compatibility pointer for the original installer filename.
- `OPERATIONS-MANUAL.md` — plain-language operator guide.
- `skills/synthetic-customer-panel/` — portable skill, workflows, standards,
  deterministic scripts, and workspace templates.
- `skills/synthetic-customer-panel/KIT-METADATA.json` — installed kit identity,
  version, and payload digest manifest.
- `verify-copied-install.ts` — source-side byte-for-byte comparison of the
  retained source payload and a copied destination.
- `skills/synthetic-customer-panel/scripts/verify-install.ts` — deterministic
  metadata and non-verifier file check to run from the copied payload.
- `skills/synthetic-customer-panel/scripts/check-node.sh` — bash-only Node
  floor preflight; prints the upgrade action when the machine is short.
- `tests/` — behavior tests for initialization, validation, run preparation,
  and completed-run validation.

## Core boundary

This folder is clean PoC source. Customer and internal work happens only in
copied kit folders under `working_pocs/` and the workspaces those copies create.

## Development verification

This kit declares Node because its deterministic panel tools are TypeScript —
at runtime as well as in development, which is why Node is stated as a T2
requirement in the tier ladder above. It does not require Python or `uv`.
Buyers need nothing beyond Node itself; the dependencies below are
development-only types for repeatable verification:

`npm install && npm run check`

## Installed-payload verification

After copying `skills/synthetic-customer-panel/` to its persistent destination,
keep this source kit available and run:

`node verify-copied-install.ts "<copied-destination>"`

It compares the retained source payload and the copy byte-for-byte, including
`KIT-METADATA.json` and `scripts/verify-install.ts`, and rejects symlinks,
non-files, missing files, and extras. Then run this command from the copied
directory:

`node scripts/verify-install.ts`

It checks its embedded metadata expectations and the file set and SHA-256
digests of every metadata-listed non-verifier file. It cannot authenticate its
own bytes; rerun retained-source `verify-copied-install.ts` to cover the
installed verifier. Neither mechanism authenticates a publisher or acts as a
cryptographic signature.

## Honest claim

The panel is a structured directional signal. It is not a substitute for real
customers, legal review, accessibility testing, usability testing, analytics,
or market evidence. Its value becomes defensible only through calibration
against real outcomes.
