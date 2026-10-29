# synthetic-customer-panel skill payload

The installed payload: `SKILL.md` (the skill entrypoint), `KIT-METADATA.json`
(installed kit identity, version, and payload digest manifest), and the
`agents/`, `assets/`, `references/`, `scripts/`, and `workflows/` folders.

The installing agent copies this whole folder as one unit. Verify a copy with
`node verify-copied-install.ts "<copied-destination>"` from the retained source
kit, then `node scripts/verify-install.ts` from the copy.
