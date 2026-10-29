# Dossier Standard

## Contents

1. Purpose
2. Evidence discipline
3. Required sections
4. Writing rules
5. Quality review

## 1. Purpose

A dossier is the seat's data source. It must contain enough specific,
contradictory, decision-relevant context for the model to react as that
composite rather than as a generic marketing critic.

Target 1,200-1,800 words. The validator rejects fewer than 900 words. Length is
not quality; unsupported detail is not research.

## 2. Evidence discipline

Use:

- direct interviews and verbatim customer language;
- support, sales, and implementation observations;
- first-party analytics;
- verified primary or authoritative sources;
- clearly labeled modeled assumptions.

For each dossier, list sources in `Evidence basis` using lines beginning with
`- Source:`. State what each source supports. Local private sources may use a
descriptive path or interview label without exposing sensitive content.

Separate:

- observed/source-backed behavior;
- reasonable composite synthesis;
- modeled assumptions needing calibration.

Do not invent precise age, income, location, ethnicity, disability, legal
status, or other sensitive traits merely to make a persona feel real. Include a
trait only when evidence supports it and it materially changes the decision.

## 3. Required sections

Use every heading from `assets/workspace-template/dossiers/DOSSIER-TEMPLATE.md`:

1. Panel role
2. Evidence basis
3. Demographics and context
4. Professional or life background
5. Primary goals and motivations
6. Secondary goals
7. Pain points
8. Emotional frustrations
9. Empathy map
10. Channels and content habits
11. Decision-making process
12. Buying or action history
13. Voice notes
14. Boundaries and likely no
15. Modeled assumptions
16. Where this composite misfires

## 4. Writing rules

- Write a composite with a human name, not a caricature.
- Tie every section to the declared decision.
- Give the seat a credible reason to ignore or reject the artifact.
- Include actual phrases the seat might use, without turning voice into parody.
- Encode conflicting values across seats.
- Keep generic copywriting advice out of the dossier.
- Never instruct a seat to help the owner succeed.
- A hard-no must remain capable of saying no to excellent work.
- A wrong-fit seat must describe what mistakenly attracts it.
- A specialist must use an explicit gate and `NOT-APPLICABLE` customer decision.
- A double-quoted span of four or more words (straight or curly quotes) on a
  `- Evidence:` line is a verbatim quote: it must appear, after whitespace and
  quote-character normalization, in some file under the workspace `evidence/`.
  Shorter quoted spans are labels and are exempt. `validate-panel.ts` fails an
  unmatched quote as `dossier-quote-unverified`.
- A fetched public source is cited by its `S<NNN>` id from
  `evidence/SOURCES.md` followed by the verbatim quote:
  `- Evidence: S003 "exact words from the page" — what it supports`.
- `## Where this composite misfires` names the situations where this
  composite's reaction should not be trusted: buyers, channels, or artifact
  types it does not model. It carries the same 25-word substance minimum as
  every other section.

## 5. Quality review

Reject or rewrite a dossier when:

- another dossier could use it with only the name changed;
- the evidence section contains no source;
- assumptions are presented as facts;
- every pain point maps neatly to the owner's offer;
- the seat has no plausible non-response;
- voice notes sound like an AI consultant;
- the dossier is long because it repeats itself.
