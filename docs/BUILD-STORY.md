# How AI Marketing Panel was built

This repo was published on 2026-08-23 as one commit at version 1.2.3, so the
public git log is short. The history below comes from the kit's CHANGELOG
(seven releases, 1.0.0 to 1.2.3), the commit history of the private
consulting repository where the kit was developed (2026-07-16 to 2026-08-24),
and the issues and pull requests on the author's self-hosted Forgejo instance.

## The problem and the first version

Small businesses write their own web pages, prices and emails, and most never
test them before customers see them, because a commissioned focus group costs
too much and takes too long. The kit gives the person who wrote the copy a
structured critique from a panel of researched customer composites first. It
is directional evidence, not customers, and the kit says so in its outputs.

Version 1.0.0 shipped on 2026-07-16 as a portable skill for AI coding agents:
an audience-neutral panel skill, workflows, deterministic tools, workspace
templates and behaviour tests. The working name was "Synthetic Customer
Panel", which is still the skill's folder name.

## Timeline

| Date | Version | What changed |
| --- | --- | --- |
| 2026-07-16 | 1.0.0 | Panel skill, workflows, deterministic tools, templates, behaviour tests. |
| 2026-07-16 | 1.1.0 | A shared kit contract: `INSTALL.md`, `kit.json` with a JSON schema, four install modes (full, persistent-files, session-only, handoff), structured install receipts. |
| 2026-07-16 | 1.1.1 | Validation of dossier substance, reaction contracts, cited evidence and score arithmetic; each run bound to the exact bytes of the panel snapshot; seat weights replaced by role-specific decision signals. |
| 2026-07-30 | | Listed on the author's consulting site as a kit. |
| 2026-08-12 | 1.2.0 | Rooms: a panel becomes a named, reusable room, so the expensive part (the researched seats) survives the cheap part (a run). `room.sh` adds clean, seat and room commands. |
| 2026-08-13 | 1.2.1 | Bun removed; every script runs on plain Node with no install step. |
| 2026-08-13 | 1.2.2 | Node floor raised from 22.6.0 to 22.18.0 after runtime bisection. |
| 2026-08-17 | 1.2.3 | Fixes from a cross-family model review: own-data verification required in every install mode, the refusal moved into the workflow that owns the step, a bash Node-version preflight. |
| 2026-08-23 | | Public release under MIT. |

## Key design decisions

- **The AI writes, a script judges.** Seat dossiers and reactions are written
  by the model. `validate-panel.ts` and `validate-run.ts` decide whether they
  are acceptable: substance and separation of dossiers, reaction grammar,
  cited evidence, score arithmetic, and agreement between the Markdown report
  and `OUTCOME.json`.
- **Personas are built once, runs are cheap.** The cost of a panel is in
  researching the seats. Rooms (1.2.0) keep the seats and archive only the
  run, so a rerun takes minutes. `room.sh clean` moves old runs to
  `_archive/<stamp>/` instead of deleting them, and a bounced seat stays on the
  roster as inactive.
- **Refuse when the input is not real.** `workflows/build-panel.md` starts with
  a mechanical check: a decision with an observable outcome in the brief, and
  at least one first-party source. Without both, the kit stops with fixed
  refusal text instead of guessing.
- **No install step for the buyer.** 1.2.1 removed Bun because a buyer should
  not have to install a second runtime. The TypeScript runs directly on Node
  with type stripping, and tests use `node --test` through a small shim.
- **Label estimates as estimates.** The README's cost and turnaround
  comparison has been marked as an unmeasured estimate since 1.2.0.

## How AI models and agents were used

- The kit is itself an agent skill: it runs inside Claude Code, Codex or a
  similar harness; `agents/openai.yaml` gives Codex its display name and
  default prompt.
- It was built by AI coding agents under the author's direction, with
  deterministic scripts written for every step a script can check.
- Release 1.2.3 is the fix pass from a cross-family review (a Claude model and
  a GPT model, 2026-08-17). The CHANGELOG records each finding and its fix,
  for example that the own-data requirement sat inside one bullet of a list
  and so governed only one of four install modes.
- The CHANGELOG states what was not verified as plainly as what was. 1.2.3
  records that `npm run typecheck` was not run in that checkout, and why.

## How it is tested

- `tests/kit.test.ts` is a behaviour suite (462 lines) run with
  `node --test`. It drives the real scripts in temporary workspaces through
  `tests/harness.ts`. `npm run check` runs the TypeScript type check and the
  suite.
- `verify-install.ts` checks an installed copy against the hashes in
  `KIT-METADATA.json` (30 payload files at 1.2.3), and
  `verify-copied-install.ts` checks that a copy equals its source.
- `check-node.sh` was verified against a passing Node and a stubbed
  below-floor Node, and `room.sh` against Apple's stock bash 3.2.

## What did not work, and what changed

- **The first Node floor was wrong.** 1.2.1 declared Node 22.6.0. Runtime
  bisection showed that adding `--experimental-strip-types` to the parent
  process does not reach the child Node processes the tests spawn, so 1.2.2
  raised the floor to 22.18.0, where type stripping is on by default.
- **A version check that cannot run.** A Node version guard written in
  TypeScript never runs below the floor, because the file does not parse
  there. The 1.2.3 check is written in bash instead.
- **A refusal in the wrong place.** In 1.2.2 the only refusal lived in
  `INSTALL.md`, so an agent that lost that file had a kit with no stop
  conditions. 1.2.3 moved it into the workflow that owns the step.
- **Version drift.** `package.json` said 1.1.1 while `VERSION` said 1.2.0;
  the kit validator caught it, and 1.2.1 fixed both.
- **A stray lockfile.** A Bun lockfile shipped to buyers inside the zip after
  Bun was gone. 1.2.1 removed it.

## Current state

Stable at 1.2.8. Since 1.2.5 the kit includes `render-report.ts`, which renders
a validated run as one self-contained results page. There is no
worked example run in `examples/`.
