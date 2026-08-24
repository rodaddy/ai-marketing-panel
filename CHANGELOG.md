# Changelog

All notable changes to Synthetic Customer Panel are recorded here. This file
follows Keep a Changelog and Semantic Versioning.

## [1.2.3] - 2026-08-17

Cross-family review (Opus + Terra, 2026-08-17) findings on the 1.2.2 hardening
pass. All fixes are to install contract, refusal placement, and the Node floor
guidance; no panel methodology changed.

### Fixed

- **Own-data verification now applies in every install mode.** In 1.2.2 the
  §4.10 buyer-own-data run and its §4.9 refusal were written inside the `full`
  bullet of INSTALL.md step 9, so by list structure they governed only that one
  mode. `persistent-files`, `session-only`, and `handoff-required` installs
  could emit an installed-class receipt having never touched buyer data. The
  requirement is now its own top-level step 10, stated as required in every
  mode, with a per-mode honest report (`degraded` where the validator cannot
  run, `blocked`/`failed` where the buyer has no real input). This also
  resolves the malformed trailing semicolon that ran the refusal paragraph into
  the `persistent-files` bullet.
- **The named refusal now lives in the workflow that owns the step.** KIT-STANDARD
  §4.9 requires the condition, the stop, and the exact wording to sit in
  `SKILL.md` or the owning workflow, with a deterministic trigger. In 1.2.2 the
  only refusal was prose in `INSTALL.md`, and `build-panel.md` had no stop at
  all — a buyer whose agent lost `INSTALL.md` had a kit with zero refusal
  conditions. Added `workflows/build-panel.md` §0 with a mechanical two-part
  check (a decision with an observable outcome in `PANEL-BRIEF.md`, and at
  least one first-party source in `evidence/SOURCE-NOTES.md`), the verbatim
  refusal text, and the no-guessing-past-the-gap rule. Added invariant 12 to
  `SKILL.md` naming the gate and pointing at that heading.
- **Added `scripts/check-node.sh`, a bash-only Node floor preflight.** 1.2.2
  raised the floor to 22.18.0 but nothing asserted it at runtime, so a buyer on
  22.6–22.17 got a raw TypeScript SyntaxError instead of the upgrade action
  INSTALL.md step 8 promises. A guard inside a `.ts` file cannot work here —
  below the floor the file never parses — so the check lives in bash, the
  runtime every buyer already has. Exit `0` pass, `1` Node missing or too old
  (printing the per-OS upgrade action), `3` harness error. It parses on Apple's
  stock bash 3.2; verified against both a passing and a below-floor Node.
- **README tier ladder now carries the upgrade line.** KIT-STANDARD §9.3
  requires the T2 runtime dependency to be stated beside the tier ladder with
  the install line the user would need. The ladder stated the floor but not how
  to reach it, and the 22.6–22.17 window is exactly the population that
  upgraded on this kit's own advice one release earlier. The ladder now names
  that window explicitly, says it is below the floor, and gives the install
  path.

### Verified

- `node --test tests/kit.test.ts` — 1 suite, 1 test, 0 failures, on Node 26.6.0.
- `node skills/synthetic-customer-panel/scripts/verify-install.ts` — PASS
  synthetic-customer-panel@1.2.3, 30 non-verifier payload files.
- `node verify-copied-install.ts <copy>` — PASS copied-install equality.
- `bash skills/synthetic-customer-panel/scripts/check-node.sh` — exit 0 on a
  conforming Node; exit 1 with the upgrade action on a stubbed v22.17.1.
- `bash skills/synthetic-customer-panel/scripts/room.sh room list` — exit 0
  under `/bin/bash` (bash 3.2).
- `npm run typecheck` was NOT run: `typescript` is a devDependency and no
  `node_modules` is installed in this checkout. That is unchanged from 1.2.2 and
  is not a claim that types were checked.

### Changed

- Regenerated `KIT-METADATA.json` digests and the embedded verifier metadata
  hash for 1.2.3, and added `check-node.sh` to `kit.json`
  `verification.files` and the README package list.

## [1.2.2] - 2026-08-13

Hardening pass for the plain-Node buyer path and install truthfulness.

### Fixed

- Raised the declared and documented runtime floor from Node 22.6.0 to Node
  22.18.0. The earlier floor was disproven by runtime bisection: unflagged type
  stripping is available at 22.18.0, while adding `--experimental-strip-types`
  to an older parent process does not cover the unflagged child Node processes
  spawned by the behavior tests.
- Removed the obsolete type-stripping flag guidance. Buyer commands now use
  plain `node` only and never require Bun, a build step, or a package install.
- Added the missing buyer-owned first verification and named refusal to
  `INSTALL.md`: installation remains unverified until a real buyer decision and
  customer evidence produce a panel that passes strict validation; shipped
  sample data and invented personas cannot stand in.
- Replaced vendor-ambiguous "parallel workers" language with the portable T1/T2
  execution contract: subagents running workflows at T1, separate fresh
  sequential contexts at T2.
- Regenerated installed-payload metadata and verifier expectations for 1.2.2.

### Verified

- Plain-Node behavior tests and kit verification commands are recorded in the
  pull request receipts.

## [1.2.1] - 2026-08-13

Bun removed. The kit's TypeScript now runs on plain Node, so a buyer never
installs Bun to use it.

### Changed

- **Every deterministic script runs under plain `node`.** Project rule: kits
  never require Bun — a buyer must never have to install it. The scripts stay
  TypeScript; Node executes them directly with no
  build step, no bundler, and no `npm install`.
- **Ported the three Bun-specific things:** `import.meta.dir` ->
  `import.meta.dirname`; relative imports now carry explicit `.ts` extensions,
  which Node ESM requires; `bun:test` / `Bun.spawn` -> `node --test` with
  `node:child_process`, via a dependency-free `tests/harness.ts` shim.
- **Declared runtime is now `node >=22.6.0`** in `kit.json`, replacing
  `bun >=1.0.0`. On Node 23.6+ the plain `node script.ts` form used throughout
  the docs works as written; 22.6-23.5 needs `--experimental-strip-types`.
- Documentation, `SKILL.md`, workflows, `INSTALL.md`, and `README.md` reworded
  from Bun to Node, including the T2 dependency floor and the install receipt.
- Regenerated `KIT-METADATA.json` and the embedded verifier digests.

### Removed

- **`bun.lock` no longer ships to buyers.** It was tracked and inside the zip,
  so every buyer received a Bun lockfile pinning `@types/bun` and `bun-types`
  for a kit that no longer uses Bun. Nothing referenced it — not `kit.json`
  `verification.files`, not the integrity manifest, not any script — so it was
  orphaned Bun tooling state contradicting the ruling on the buyer's disk.

### Fixed

- `package.json` version was `1.1.1` while `VERSION` said `1.2.0`, which
  `validate-kit.ts` reported as `package-version-drift`. Both now read `1.2.1`.
- The `INSTALL.md` receipt template still said `version: 1.1.1`.

### Verified

- The behavior suite passes under plain `node --test`. Exit `0`.
- `node scripts/verify-install.ts` passes: 29 non-verifier payload files match.
- `node validate-kit.ts synthetic-customer-panel` passes: kit contract valid.

## [1.2.0] - 2026-08-12

Room lifecycle. A panel is now a named, reusable ROOM rather than a one-shot
workspace, so the expensive part (the seats) survives the cheap part (a run).

### Added

- `skills/synthetic-customer-panel/scripts/room.sh` — room lifecycle tooling.
  Bash and coreutils only; no Bun, no jq, no install step. Parses on Apple's
  stock bash 3.2.
  - `clean [--room X]` — the five-minute rerun path. Archives runs, inputs, and
    calibration to `_archive/<stamp>/`, leaves the roster and every dossier
    untouched, then asserts the room is rerun-ready.
  - `seat list | bounce <ids> | refresh <ids> --criteria "..."` — seat-level
    ops. `refresh` archives the old dossier, deactivates the seat, and stages a
    filled authoring prompt per seat; the dossier itself is written through the
    existing seat-authoring workflow and gated by `validate-panel.ts`.
  - `room new <name> [--from <room>] | room list | room archive <name>` —
    named rooms that run in parallel without sharing state.
  - `--list` dry run on every mutating command; exit `0` pass / `1` failed /
    `3` harness error; refuses to run outside a kit root; idempotent.
- `skills/synthetic-customer-panel/workflows/room-lifecycle.md` — the workflow,
  including running N rooms concurrently and a migration note for the older
  flat workspace layout (rooms are additive; a flat workspace keeps working).
- README section on why the panel gets run instead of skipped, with the cost
  and turnaround comparison marked as an unmeasured estimate.

### Changed

- `SKILL.md` routes rerun/seat-swap/parallel requests to the new workflow and
  lists the room commands beside the existing deterministic tools.

### Notes

- Nothing is ever deleted. Every removal is a move into `_archive/<stamp>/`,
  and a bounced seat keeps its roster entry with `"active": false`.
- The script performs zero dossier authoring. It stages; the AI writes; the
  existing validator decides.
- Validation is per room. A passing room proves nothing about the room next
  door.

## [1.1.1] - 2026-07-16

### Added

- Added retained-source copy equality plus local metadata and non-verifier file
  checks; the retained-source check must be rerun to cover the installed
  verifier, and neither mechanism authenticates a publisher.
- Added deterministic validation for dossier substance and separation,
  reaction contracts, run failures, cited evidence, and score arithmetic.
- Added run-folder identity, chronological run/attestation bounds, and a small
  deterministic Markdown-to-`OUTCOME.json` agreement contract for completed
  washes.

### Changed

- Replaced seat weights with role-specific decision signals.
- Confined panel initialization and run I/O to explicit owned roots.
- Record copied artifact labels and hashes without persisting source paths.
- Label operator-recorded isolation as unverified and require attestations for
  runtime-verified isolation claims.
- Validate frozen snapshot semantics, exact reaction grammar, and run-bound
  attestation metadata before accepting a completed wash.
- Bind each run to the exact panel snapshot bytes and require valid creation
  and completion timestamps.
- Require completed timestamps not to precede creation, runtime attestations to
  stay within the recorded run window, and human result markers to agree with
  canonical structured outcome values.

## [1.1.0] - 2026-07-16

### Added

- Added canonical `INSTALL.md`, `kit.json`, and a standalone manifest schema.
- Added full, persistent-files, session-only, and handoff installation modes.
- Added runtime declarations and structured installation receipts.
- Added deterministic contract validation and code-free kit coverage.

### Changed

- Moved the reusable source into `pocs/portable-kits/`; real use now happens
  only in copies under `working_pocs/`.

## [1.0.0] - 2026-07-16

### Added

- Created the audience-neutral panel skill, workflows, deterministic tools,
  workspace templates, and behavior tests.
