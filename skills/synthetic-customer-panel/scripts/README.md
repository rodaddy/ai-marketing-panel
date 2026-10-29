# scripts/

The deterministic tools that judge panel and run state, so a verdict does not
depend on the model: `init-panel.ts`, `validate-panel.ts`, `prepare-run.ts`,
`validate-run.ts`, `render-report.ts` (the report page, with `run-view.ts`), `fetch-evidence.ts`
(public pages into `evidence/sources/S<NNN>.md`), `verify-install.ts`, and shared `lib.ts`. `room.sh` is the
bash-only room lifecycle and `check-node.sh` is the bash-only Node floor
preflight.

The `.ts` tools run with plain `node` (22.18.0+), no flags or build step. The
two `.sh` files need only bash and coreutils, which is what keeps the T2 floor
reachable.
