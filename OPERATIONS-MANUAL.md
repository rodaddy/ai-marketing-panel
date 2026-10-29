# Synthetic Customer Panel — Operations Manual

## What it is

The panel is a small group of carefully researched customer composites. Each
person sees the same artifact independently and reacts from a different set of
needs, constraints, history, and decision power. A separate reviewer then shows
where they agree, where they disagree, who would act, and why.

## Build a panel

Say “build a customer panel.” The AI will ask only for information it cannot
discover safely: what decision the panel should inform, which customers matter,
what evidence exists, what should count as success, and which people should
properly say no.

A ready panel has:

- 5-15 explicitly selected seats;
- a complete dossier for every seat;
- at least one wrong-fit or hard-no seat;
- a written owner/offer context;
- a scoring method whose weights total 100;
- a real outcome that can later calibrate the prediction.

### When it will refuse to build

Two things are required, and the kit stops and asks rather than making them up:

1. **A real decision**, stated so a real-world outcome could later prove it
   right or wrong. "Will people like it?" is not one; "should we send this
   email to the installer list, or rewrite the offer first?" is.
2. **Your own customer evidence** — at least one first-party source about real
   customers. Interview notes, sales or support threads, won/lost notes, review
   text, survey answers, behavior analytics, or your own written notes on
   specific customers you have actually dealt with.

If either is missing, the kit says exactly what it has and what it is missing
and asks one question. It will not fill the gap with the sample artifact, with
market-research generalities, or with personas invented from a demographic. A
panel built out of nothing produces confident output with nothing behind it,
which is worse than no panel. The wording it uses is in
`skills/synthetic-customer-panel/workflows/build-panel.md` §0.

## Wash an artifact

Give the artifact and say “wash this artifact.” It may be copy, a page, an
email, an offer, a document, a screenshot, or another decision object the
panel was built to assess.

The AI prepares one task per seat and records the execution mode and provenance.
Only a runtime attestation supports an isolation claim; an operator-recorded
isolated mode remains an unverified warning. It returns:

- each panelist's decision and raw reaction;
- agreement, dissent, and wrong-fit behavior;
- a separate weighted scorecard with machine-checkable arithmetic and reaction citations;
- a directional ship/revise/stop decision;
- the smallest useful next experiment.

To get the report, say "render the report": the AI writes `REPORT.html` in the
run folder; open it in a browser and press Download PDF to save a PDF.

To add public customer language, give the AI links to reviews or forum threads
and say "fetch these as evidence": it saves each page as a numbered source
(`S001`, `S002`, ...) that seat dossiers can quote, alongside your own evidence.

## Rewrite and retest

Say “rewrite and retest.” The AI writes three materially different revisions
from the panel evidence, runs each through a fresh wash, and compares like with
like. It does not keep rewriting forever: after three cycles without a meaningful
gain, it stops and recommends real-customer research.

## Calibrate

When real results arrive, say “calibrate the panel” and provide the outcome.
Examples include replies, conversions, meetings booked, task completion,
qualified inbound, or another predeclared measure. The run stays unchanged; the
actual result is appended to the calibration ledger.

Do not tune weights from one surprising result. Look for repeated misses across
comparable runs.

## How to read the output

- A hard-no saying no is often healthy.
- A wrong-fit seat saying yes can mean the artifact attracts the wrong customer.
- Agreement is useful; disagreement is often more useful.
- An all-positive panel is an integrity warning, not a victory.
- A high score is directional. The only truth comes from real outcomes.

## Limits

This kit does not send, publish, buy, approve, or deploy anything. It does not
replace real customer interviews, professional review, or measured behavior.
Sensitive, regulated, legal, medical, or financial decisions require the
appropriate qualified human review.
