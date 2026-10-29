# Unanimity Press Protocol

This file is for the synthesizer and for the one pressed seat. It is never
pasted into a first-round seat task.

## When the press runs

When every active customer seat gives the same `DECISION`, the run holds one
pressed reaction. The synthesizer names the customer seat most at risk of
being wrong. That seat runs once more, isolated. Its pressed task is built
from exactly four inputs: its own dossier, the artifact snapshot,
`references/seat-protocol.md`, and this file. It never sees another seat's
reaction, the synthesis, or the vote count.

## Writing the counter-case

The synthesizer writes the counter-case paragraph from the pressed seat's own
dossier and the artifact only. The paragraph must not quote, paraphrase, or
summarize any seat's reaction, including the pressed seat's own first-round
reaction, and must not mention how many seats answered or how the panel
combines votes.

## Press prompt

```text
Before you answer, consider the strongest case against <YES|NO>: <one paragraph
stating the best concrete reason a person like you would decide the opposite>.
React to the artifact again as yourself. Change your answer only if that case
is true for you.
```

## Output

Save the answer as `reactions/<seat-id>.pressed.md` in the ten-line output
contract from `references/seat-protocol.md`, and record the seat as
`OUTCOME.json` `consensus.pressed_seat`. The pressed file is not a seat reaction
and is not counted in the roster. There is no debate round: seats never respond
to each other. The validator cannot prove the pressed run was isolated and
warns `unverified-isolation` for every pressed file it accepts.
