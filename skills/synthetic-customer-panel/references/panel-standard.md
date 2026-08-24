# Panel Standard

## Contents

1. Decision contract
2. Roster design
3. Manifest contract
4. Readiness gates
5. Anti-patterns

## 1. Decision contract

Every panel predicts or informs one explicit decision. Define:

- who might act;
- what action or judgment matters;
- which artifact is being judged;
- the real outcome measure;
- the observation horizon;
- what the panel cannot know.

“Do they like it?” is not a decision contract. “Would a qualified operations
buyer request a scoped assessment after reading this page?” is.

## 2. Roster design

Use 5-15 active seats. Add a seat only when its reaction should differ for a
substantive reason.

The deterministic dossier-similarity check only flags likely reused writing; it
does not establish that any composite is a real customer or that its predicted
reaction is true.

Cover meaningful variation in authority, maturity, urgency, risk, prior
experience, constraints, channel behavior, and fit. Do not create demographic
variety without behavioral consequence.

Allowed kinds:

- `buyer` — can authorize or purchase;
- `user` — experiences the workflow or problem;
- `influencer` — affects reach, trust, or selection;
- `specialist` — applies a non-customer gate.

Allowed fit values:

- `core` — desired customer for this decision;
- `adjacent` — plausible but not central;
- `wrong-fit` — should usually reject or be excluded;
- `hard-no` — fixed principled non-converter whose dissent tests integrity.

Require at least one active `core` seat and one active `wrong-fit` or `hard-no`
seat. Specialists do not substitute for deliberate customer dissent.

## 3. Manifest contract

`panel.json` is the sole active-roster source. Dossier files on disk do nothing
unless an active manifest entry references them.

Each seat requires:

- stable lowercase `id`;
- composite `name`;
- `kind` and `fit`;
- relative `dossier` path under `dossiers/`;
- role-specific `decision_signal` that says what this seat would do or gate;
- `active` boolean;

The manifest also records the decision contract, owner-context path, evidence
index, execution mode, wave limit, scoring dimensions, and review date.

Keep old manifest snapshots with completed runs. Never silently reinterpret a
historical score using today's roster.

## 4. Readiness gates

A ready panel must pass:

- 5-15 active seats;
- unique valid IDs and dossier paths;
- one complete dossier per active seat;
- at least one core and one deliberate dissent seat;
- separate owner context and evidence index;
- 3-8 scoring dimensions totaling 100;
- isolated execution as preferred mode, with operator-recorded isolation marked
  unverified unless a runtime attestation is present;
- declared calibration outcome and horizon;
- no unresolved placeholder text.

## 5. Anti-patterns

- Thirteen seats because another panel used thirteen.
- One generic ICP copied into different names.
- Every seat wanting the same outcome.
- A compliance specialist counted as a buyer.
- Filesystem scanning as roster selection.
- Owner voice or desired answer fed to panel seats.
- A score with hidden or changing weights.
- Treating synthetic agreement as measured customer truth.
