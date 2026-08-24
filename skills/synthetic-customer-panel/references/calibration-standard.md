# Calibration Standard

## Predeclare

Before a wash, record:

- the real outcome;
- observation horizon;
- segment or channel;
- expected direction;
- known external factors.

Do not choose a different success metric after seeing the result.

## Ledger

Append one immutable row per completed run:

| Run ID | Date | Panel version | Predicted decision | Panel score | Actual outcome | Horizon | Segment | Error class | Notes |
| ------ | ---- | ------------- | ------------------ | ----------: | -------------- | ------- | ------- | ----------- | ----- |

Link detailed evidence without copying secrets or customer content into the
ledger.

## Tuning rules

- One result is a story, not calibration.
- Compare like artifact types, channels, segments, and horizons.
- Prefer dossier or roster corrections when repeated misses trace to who was
  absent or mis-modeled.
- Prefer weight changes only when reaction evidence was sound but synthesis
  ranking repeatedly missed reality.
- Version material roster or scoring changes.
- Keep historical runs bound to the manifest snapshot that produced them.

Report hit rate only with a clear denominator, outcome definition, and sample
size. Never generalize beyond the calibrated task.
