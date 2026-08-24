# Synthesis and Scoring

## Contents

1. Separation
2. Synthesis contract
3. Scoring contract
4. Decision contract
5. Integrity warnings

## 1. Separation

Close seat execution before synthesis. The synthesizer receives reactions,
manifest metadata, owner context, and scoring rules only after all independent
reactions are saved.

## 2. Synthesis contract

Write `SYNTHESIS.md` for people and `OUTCOME.json` for validation. `OUTCOME.json`
is canonical; the Markdown is a readable explanation with a small deterministic
agreement contract. `OUTCOME.json` must contain a non-empty citation list for
synthesis evidence and dissent, a LOW/MEDIUM/HIGH confidence, and substantive
limitations.

Write `SYNTHESIS.md` with:

- seat-by-seat decision table;
- core-fit yes/no pattern;
- wrong-fit and hard-no behavior;
- specialist gates;
- agreement clusters with exact reaction evidence;
- consequential dissent;
- artifact elements that landed;
- artifact elements that resisted;
- missing proof or context;
- evidence gaps and failed seats;
- three smallest useful changes.

Preserve minority objections when the seat has authority, exposes harm, or
represents a declared gate. Do not turn frequency into truth.

`SYNTHESIS.md` must contain exactly one standalone
`SYNTHESIS_CONFIDENCE: <LOW|MEDIUM|HIGH>` marker and these exact level-two
headings: `## Decision table`, `## Agreement clusters`, `## Consequential
dissent`, and `## Limitations`. Its marker must equal
`OUTCOME.json.synthesis.confidence`; prose outside the required contract stays
free-form.

## 3. Scoring contract

Use only dimensions and weights from `panel-snapshot.json`. For every dimension:

1. assign a 0-100 raw score;
2. cite reaction evidence;
3. multiply by its manifest weight;
4. show the weighted contribution.

The total is the sum of weighted contributions. In `OUTCOME.json`, record every
frozen dimension exactly once as `{ id, raw_score, weighted_contribution,
evidence }`; each evidence item cites `{ seat_id, field }` from a reaction. The
validator recomputes `raw_score × manifest weight / 100` and the bounded total.
Report it as a directional panel score, not probability.

`SCORECARD.md` must contain exactly one standalone
`SCORECARD_TOTAL: <OUTCOME.json scorecard.total>` marker and these exact
level-two headings: `## Dimension arithmetic` and `## Total`. Its total marker
must equal the validated `OUTCOME.json.scorecard.total`; the arithmetic prose
stays free-form.

Declared specialist flags and integrity failures can cap or override the total.
Explain every override.

## 4. Decision contract

`RESULT.md` returns, and `OUTCOME.json.result` records:

- `SHIP` — panel evidence supports a controlled real-world test;
- `REVISE` — address named issues and retest;
- `STOP` — wrong audience, failed gate, dishonest claim, or missing foundation.

Include confidence, strongest evidence, strongest dissent, limitations, and the
smallest real-world experiment that could prove the panel wrong.

`RESULT.md` must contain exactly one standalone `RESULT_DECISION:
<SHIP|REVISE|STOP>` marker and one `RESULT_CONFIDENCE: <LOW|MEDIUM|HIGH>`
marker. It must include these exact level-two headings: `## Evidence`, `##
Dissent`, `## Limitations`, and `## Next experiment`. Both values must equal
`OUTCOME.json.result`; prose outside the required contract stays free-form.

## 5. Integrity warnings

Flag:

- every active customer seat says yes;
- hard-no seat converts without a credible reason;
- wrong-fit seats are more positive than core seats;
- near-identical reactions;
- generic consultant language from seats;
- shared-context degraded execution;
- missing reactions;
- scoring weights changed after seeing results.
