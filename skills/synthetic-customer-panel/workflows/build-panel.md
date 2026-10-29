# Build a Panel

Read `references/panel-standard.md`, `references/dossier-standard.md`, and
`references/safety-and-honesty.md` completely before building.

## 0. The gate: no decision and no evidence, no panel

**This kit refuses to build a panel out of nothing.** A panel invented from a
job title and a guess is not research, it is a cast of agreeable characters, and
shipping one would be worse than shipping no panel at all — it produces
confident output with nothing behind it.

Before anything is written, collect exactly two things from the owner and write
them down:

1. **The decision.** One specific decision this panel informs, stated so that a
   real-world outcome could later prove it right or wrong. "Will people like
   it?" is not a decision. "Should we send this launch email to the installer
   list, or rewrite the offer first?" is.
2. **Their own customer evidence.** At least one first-party source about real
   customers: interview notes, sales or support transcripts, won/lost notes,
   review text, survey answers, analytics on real behavior, or the owner's own
   written account of specific customers they have actually dealt with.

**The check is mechanical, not a judgement call. Both must be true:**

- `PANEL-BRIEF.md` names one decision with an observable outcome; and
- `evidence/SOURCE-NOTES.md` records at least one first-party source with its
  date, scope, and what it actually supports.

If either is missing or empty, **STOP. ASK.** Say this, in the owner's own
terms:

> I can't build this panel yet, and I don't want to hand you seats I made up.
>
> Here is what I have: [name exactly what was provided — the artifact, the
> product description, whatever is in hand].
>
> Here is what I am missing: [the decision, or the customer evidence, or both,
> named specifically].
>
> [Then ask the ONE question that unblocks it: "What decision would this panel
> settle for you?" or "What can you show me about customers you have actually
> dealt with — sales calls, support threads, reviews, or just your own notes on
> five real ones?"]
>
> I can build a panel from thin evidence and mark every seat as an assumption,
> but you should know what that is worth before I spend your time on it.

**Never paper over the gap.** Do not substitute `inputs/SAMPLE-ARTIFACT.md`, the
workspace templates, market-research generalities about an industry, or personas
invented from a demographic. Do not proceed on a stand-in and label it later.

**Never guess past the gap.** If the owner supplies the decision and thin or
partial evidence, you may proceed — but every seat trait not traceable to a
source is marked as an assumption per §3, the panel stays in the draft state
(`validate-panel.ts --allow-draft`), and it is not promoted to a strict-valid
panel until the owner confirms or supplies what is missing.

## 1. Establish the owned workspace

Confirm the work is happening in a copied kit or a new panel workspace, never in
the canonical base or `pocs/`. Initialize:

`node "<skill-root>/scripts/init-panel.ts" --owned-root "<owned-root>" "<target>" --name "<panel name>"`

Do not edit the workspace template inside `assets/`.

## 2. Define the prediction

Record in `PANEL-BRIEF.md`:

- the exact decision this panel informs;
- the artifact types it may review;
- the core audience and excluded audiences;
- the owner/offer context;
- what an observable real-world success or failure looks like;
- the calibration horizon;
- important ethical, compliance, accessibility, or brand gates.

Turn vague goals such as “will people like it?” into an observable question such
as “which qualified customer segment would request a discovery call, and why?”

## 3. Collect evidence before inventing seats

Use first-party interviews, sales/support language, analytics, customer
documents, verified market research, and primary sources when available. Record
every source in `evidence/SOURCE-NOTES.md` with date, scope, reliability, and
what it actually supports.

Public customer language (reviews, forum threads, public Q&A) can supplement
that evidence. Put one URL per line in a list file and run
`node scripts/fetch-evidence.ts <workspace> <url-list-file>`: each page lands as
`evidence/sources/S<NNN>.md` and `evidence/SOURCES.md` indexes them. Cite a
fetched source on a dossier `- Evidence:` line by its id with a verbatim quote,
for example `- Evidence: S003 "we waited three weeks for a callback" — ...`;
`validate-panel.ts` checks the quote against every file under `evidence/`.
Fetched public text supplements the owner's first-party evidence and never
replaces it: it does not clear the §0 gate.

Never convert a thin demographic stereotype into a precise fictional biography.
Mark every unsupported but useful modeling choice as an assumption.

If `evidence/SOURCE-NOTES.md` still records no first-party source at the end of
this step, the §0 gate has not been cleared. Go back to §0 and refuse; do not
continue to §4 and invent the roster.

## 4. Design the roster

Choose 5-15 seats from meaningful differences in:

- problem intensity and maturity;
- buying authority and workflow influence;
- trust history and prior attempts;
- constraints, risk tolerance, and switching cost;
- channel behavior and decision process;
- fit: core, adjacent, wrong-fit, or hard-no.

Include at least one seat that should properly reject the offer or artifact.
Specialist gates such as accessibility, compliance, or implementation may be
included, but label them `specialist` and do not count their gate as customer
enthusiasm.

Show the proposed roster and the reason each seat exists before writing all
dossiers. Merge seats that would predictably react for the same reason.

## 5. Write the manifest and dossiers

Make `panel.json` the roster source of truth. Use stable lowercase seat IDs,
relative dossier paths under `dossiers/`, and a distinct `decision_signal` for
each active buyer, user, influencer, or specialist.

Set `gender` (`woman` or `man`) on every seat that is a named person, from its
dossier and name. It is required on every active buyer, user, and influencer
seat: `validate-panel.ts` errors `missing-seat-gender` without it. A specialist
seat such as a gate reviewer may omit it and gets any unused face. Set
`age_band` (`20s` to `70s`) only when the dossier models age. They only choose
the seat's default report face. The kit ships 31 faces (17 women, 14 men) and
never repeats one in a panel: a panel that needs more of a gender, or more in
total, gets a `not-enough-faces` warning; give the extra seats
`report-img/<seat-id>.jpg` photos, or the render fails once the defaults run out.

Write one dossier per active seat from `dossiers/DOSSIER-TEMPLATE.md`. Target
1,200-1,800 words. Keep source-backed observations, composite modeling, and
assumptions visibly separate.

Do not create a dossier by duplicating another and changing a job title. Give
seats genuinely conflicting values and boundaries.

Write `owner/OWNER-CONTEXT.md` separately. Panel seats do not receive owner
voice or desired persuasion goals; only synthesis and rewriting receive that
context.

## 6. Define scoring

Choose 3-8 dimensions tied to the declared decision. Weights must total 100.
Keep scoring separate from persona reactions. Include a dimension or gate that
preserves dissent and wrong-fit integrity.

Do not borrow an unexplained universal percentage or threshold from another
panel. The starting matrix is a hypothesis to calibrate.

## 7. Validate readiness

Run strict validation:

`node "<skill-root>/scripts/validate-panel.ts" "<workspace>"`

Fix every error. Review warnings instead of automatically suppressing them.
Report the ready roster, evidence gaps, assumptions, deliberate dissent seats,
scoring weights, and calibration target. Do not run a real artifact until strict
validation passes.
