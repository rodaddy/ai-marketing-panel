# Wash an Artifact

Read `references/seat-protocol.md`,
`references/runtime-execution.md`, `references/synthesis-and-scoring.md`, and
`references/safety-and-honesty.md` completely before running.

## 1. Validate and prepare

Run:

`node "<skill-root>/scripts/validate-panel.ts" "<workspace>"`

Then prepare the immutable run packet. It copies the artifact into the run
folder; generated task text is derived from that copied artifact, never the
mutable source path:

`node "<skill-root>/scripts/prepare-run.ts" "<workspace>" "<artifact>"`

The command prints the new run folder. Validate its prepared state:

`node "<skill-root>/scripts/validate-run.ts" "<run-folder>" --prepared`

## 2. Execute independent seats

Use only the active seats captured in `panel-snapshot.json`.

Execution follows the capability tier of the harness you are in. State the tier,
then run the mode that tier supports. Never invoke `claude -p` or any
harness-specific CLI — that hard-codes one vendor into a kit meant to run
everywhere.

**T1 (subagents + workflow orchestration).** Mode `isolated-parallel`: run the
seats as **subagents running workflows**, one subagent per seat, at most seven
seats in one wave. Give each subagent exactly one file from `tasks/<seat-id>.md`
and ask it to return only the required reaction contract. A subagent must not
read the other tasks, reactions, synthesis instructions, score weights, or owner
context.

**T2 (shell-only, no subagents).** Mode `isolated-sequential`: run the seats one
at a time in separate fresh isolated contexts. Same independence, more wall
clock. This is a full-fidelity run, not a degraded one — record it as
`isolated-sequential`, not as parallel.

**T3 (chat-only, no shell).** Run the seats one at a time by hand from the task
templates. If the runtime cannot isolate contexts at all, this is
`sequential-shared-context` and carries an explicit degraded warning. Complete
each seat from its dossier and artifact before loading the next; never revise an
earlier reaction after seeing a later one.

Save each response as `reactions/<seat-id>.md`. Do not synthesize until every
active seat has either a valid reaction or a recorded failure.

When the artifact offers versions, each buyer's REACTION line opens with its
choice: `REACTION: VERSION: 2. ...` or `REACTION: VERSION: NEITHER. ...`. The
report matches `/^VERSION: *([A-Za-z0-9]+)\b/` on the REACTION value. When every
buyer reaction matches, the vote section shows version bars per fit, an
all-buyers bar, "<top> to <second>" (the most-picked version's count to the next
version's), a legend and a Version column; if any buyer reaction does not, it
shows the YES/NO bars.

## 3. Record execution truth

Update `RUN.json` with:

- the actual execution mode;
- model/runtime used when known;
- failed or retried seats;
- start and completion timestamps;
- degraded-mode reason, if any.
- execution provenance. Mark isolation `operator-recorded` unless the runtime
  has supplied a durable attestation.

`RUN.json.run_id` must be a non-empty portable string (letter/digit segments
joined by hyphens) exactly equal to the run folder name. Both timestamps
must be ISO UTC, and a completed run's `completed_at` must not be earlier than
`created_at`.

For `runtime-attested` isolation, record `isolation_attestation.provider`, a
valid ISO `issued_at`, a durable `reference`, and `run_id` exactly equal to the
run's `RUN.json.run_id`. Its `issued_at` must be inside the inclusive
`created_at` through `completed_at` run window. This binds the attestation to
the packet being validated.

Do not claim isolated execution when the runtime shared context.

Do not edit `panel-snapshot.json` after preparation. `RUN.json` records its
SHA-256 digest, and validation rejects even a structurally valid replacement.

## 4. Synthesize after reactions close

Drop every persona role. Read `SYNTHESIS-TASK.md` and all completed reaction
files. Write `SYNTHESIS.md` using the synthesis contract:

- decision table by seat;
- agreement clusters;
- consequential dissent;
- core-fit versus wrong-fit behavior;
- specialist gates;
- language that landed or failed;
- missing evidence;
- smallest useful changes.

Keep the prose free-form, but include this deterministic contract exactly once:

```text
SYNTHESIS_CONFIDENCE: <LOW|MEDIUM|HIGH>
```

Include these exact level-two headings: `## Decision table`, `## Agreement
clusters`, `## Consequential dissent`, and `## Limitations`. The confidence
marker must match `OUTCOME.json.synthesis.confidence`.

Never average away a hard-no or treat a wrong-fit yes as success.

If every active customer seat gave the same `DECISION`, press before scoring:
name the customer seat most at risk and run it once more in isolation under
`references/press-protocol.md`. Build its pressed task from its dossier, the
artifact, `references/seat-protocol.md`, and `references/press-protocol.md`
only, never other reactions; save
`reactions/<seat-id>.pressed.md`, and record `consensus.pressed_seat` in
`OUTCOME.json`. Then record `consensus.spread` and `consensus.agreement` as
`references/synthesis-and-scoring.md` §3 defines them.

## 5. Score separately

Apply only the scoring dimensions and weights in the panel snapshot. Write
`SCORECARD.md` with the arithmetic shown and the matching machine-readable
`OUTCOME.json`; its citations and contributions are what the validator checks.
A score must not override a declared hard gate.

Keep the arithmetic explanation free-form, but include this deterministic
contract exactly once:

```text
SCORECARD_TOTAL: <OUTCOME.json scorecard.total>
```

Include these exact level-two headings: `## Dimension arithmetic` and `##
Total`. The total marker must match `OUTCOME.json.scorecard.total` exactly.

Write `RESULT.md` and `OUTCOME.json.result` with a directional `SHIP`, `REVISE`,
or `STOP` decision, confidence, cited dissent, limitations, and next real-world
experiment. Set `RUN.json` status to `complete`.

Keep the result explanation free-form, but include this deterministic contract
exactly once:

```text
RESULT_DECISION: <SHIP|REVISE|STOP>
RESULT_CONFIDENCE: <LOW|MEDIUM|HIGH>
```

Include these exact level-two headings: `## Evidence`, `## Dissent`, `##
Limitations`, and `## Next experiment`. Both markers must match
`OUTCOME.json.result`.

## 6. Verify

Run:

`node "<skill-root>/scripts/validate-run.ts" "<run-folder>"`

Do not call the wash complete until this passes. Present the result and the run
folder, not a claim that the panel predicts reality.

## 7. Render the report

Run:

`node "<skill-root>/scripts/render-report.ts" "<run-folder>"`

It refuses a run that fails `validate-run.ts` and otherwise writes
`<run-folder>/REPORT.html`, one self-contained page with every image inlined.
Seat faces come from `<run-folder>/report-img/<seat-id>.jpg` when present,
else the default cartoon set in `assets/avatars/`. Each seat's Full dossier is
the workspace dossier file as it reads at render time, not a copy bound to the
run; it shows only when the run folder sits under `<workspace>/runs/`. Hand the
owner `REPORT.html`.
When the changes section renders as numbered cards, each card has an "Apply
this fix" button and the section has one "Apply all fixes" button; a click only
copies a prompt naming the room, the run and the exact change text, for the
owner to paste into this agent (`workflows/rewrite-and-retest.md`).

### REPORT-COPY.json

The synthesis step may write `<run-folder>/REPORT-COPY.json`. It is report
copy, not run provenance: RUN.json does not hash it. Every field is optional,
and a missing, empty, or non-string value falls back to the generic text with
one warning.

- `headline`: the hero H1. The panel objective then moves into "How this
  was run" as its first line, "The ask: <objective>".
- `headline_em`: a substring of the headline; its first occurrence is set in
  gold. A value that is not a substring is ignored with one warning.
- `brand`: the small line at the top left of the hero; left out when absent.
- `vote_note`: the note under the vote bars, verbatim (a leading "Label:" is
  bold).
- `change_titles`: an array of strings, one per numbered change in order;
  each becomes that card's title. A missing or short array leaves the rest
  untitled.
- `dissent_topics`: an array aligned with OUTCOME.json `result.dissent`;
  each card shows "D<n> · <topic>". A missing, null or empty entry shows the
  cited field name.
- `footer_brand`: appended to the Next band's run line as " · <footer_brand>".
- `headings`: the H2 of each section, keys `room`, `vote`, `score`,
  `changes`, `dissent`, `artifact`, `method`, `next`.
- `question`: the small line above the H1 (default: the panel name).
- `summary`: the sentence after the verdict pill; left out when absent.
- `tiles`: 1 to 4 `{ "value": string, "label": string }` hero tiles, shown
  verbatim. Without it the report computes four: core buyers YES, YES vs NO
  over all buyer seats, active seats read alone (or in shared context), and
  each specialist's panel overview (passed or needs fixes). Any other value is ignored with one warning.
- `seats.<seat-id>.quote`: the card quote.
- `seats.<seat-id>.stops`: that seat's "What stops it" cell in the vote
  section's seat-by-seat table; without it the cell is the first sentence of
  the seat's RESISTS line.

Headings, question, summary, tiles and stops must be answer-first and
supported by OUTCOME.json and SYNTHESIS.md.
A quote must appear verbatim in that seat's reaction, or the card falls back to
its LANDS line. The "What it still needs" section is the SYNTHESIS.md `## `
section whose heading contains "smallest useful changes"; without one the
section is left out.
