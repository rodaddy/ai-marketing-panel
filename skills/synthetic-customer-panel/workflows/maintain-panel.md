# Maintain a Panel

Read `references/panel-standard.md`, `references/dossier-standard.md`, and
`references/calibration-standard.md`.

## Refresh triggers

Refresh when new interviews, sales/support language, material market changes,
repeated calibration misses, or the manifest review date make the evidence
stale.

## Procedure

1. Preserve completed runs and their snapshots.
2. Append new evidence to `evidence/SOURCE-NOTES.md`.
3. Identify which seat assumptions the evidence supports, contradicts, or leaves
   unresolved.
4. Update only affected dossiers or roster entries.
5. Add, merge, deactivate, or replace seats explicitly in `panel.json`. Never
   let filesystem presence silently activate a dossier.
6. Revalidate the panel.
7. Record the change and expected effect in the panel brief.

Keep the panel between 5 and 15 active seats. Prefer stronger evidence and more
meaningful differences over a larger roster.
