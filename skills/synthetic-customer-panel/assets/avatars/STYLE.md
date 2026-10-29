# Avatar style (avatar-25 to avatar-31)

Generated 2026-10-29 with the image-gen skill, text-only:

```sh
image-gen generate --out avatar-NN.jpg --prompt-file pNN.txt --size 1:1
```

Model flare (default). Output 1254px, then `sips -Z 1024 -s format jpeg -s formatOptions 85`.
Each prompt file is the shared style block followed by one subject line.
Never use edit mode with an existing face as input: every face turns into a copy of the anchor.

## Shared style block

```text
Deliverable: one square 1:1 avatar portrait of a generic stylized 3D animated cartoon character, like a Pixar/Disney animated-film character or a Memoji/Bitmoji. It is NOT photorealistic and NOT a real person.
Style: clearly a cartoon: smooth simplified CGI skin with soft subsurface glow and rosy cheeks, slightly oversized head, large round glossy cartoon eyes with big irises and bright catchlights, small rounded nose, simple soft smile, clean stylized hair sculpted in chunky strands, soft knit or woven fabric texture on clothing. Same finish as a polished animated-movie character render.
Composition: head-and-shoulders crop, subject centred and facing the camera straight on, top of the hair near the top edge, shoulders and upper chest filling the bottom edge, head about half the frame height.
Lighting: soft, even, diffused frontal studio light from slightly above, no hard shadows.
Background: plain flat warm cream (#F3EEE4), seamless, no gradient, no objects.
Palette: natural skin tones, muted clothing colours.
Avoid: photorealism, realistic skin pores, text, logos, watermarks, props, hands, caricature, stereotype costume, religious dress or head coverings, hats, uniforms.
Subject:
```

## Subject lines

- avatar-25: A person in their 20s of East African descent, deep brown skin, short cropped natural hair with a tidy shape-up, soft rounded face, wearing a mustard-yellow crewneck t-shirt under an unbuttoned olive overshirt.
- avatar-26: A person in their 30s of South Asian descent, light brown skin, short straight black hair in a soft undercut with a longer swept top, wearing a charcoal grey hoodie.
- avatar-27: A person in their 40s of White European descent, fair skin with light freckles, short tousled sandy-brown hair, round thin-rimmed glasses, wearing a navy blue quarter-zip pullover.
- avatar-28: A person in their 40s of Hispanic/Latin American descent, warm tan skin, short wavy dark brown hair cropped close at the sides and tousled on top, wearing a rust-orange crewneck sweater.
- avatar-29: A person in their 50s of East Asian descent, light skin, a balanced face with a moderately square jaw, short salt-and-pepper hair in a short tapered crew cut with a little length on top, faint smile lines, no eyeliner, wearing a teal button-up collared shirt.
- avatar-30: A person in their 60s of Middle Eastern descent, olive skin, a balanced face with a moderately square jaw and slightly thicker natural brows, very short close-cropped grey hair, soft lines around the eyes, rectangular dark-framed glasses, no eyeliner, wearing a burgundy cardigan over a plain cream t-shirt.
- avatar-31: A person in their 70s of Black African-American descent, medium-dark brown skin, a balanced face with a moderately square jaw, a very short white buzz cut, gentle wrinkles and smile lines, plain unlined eyes with no eyeliner, wearing a soft heather-grey fleece zip jacket.

## Lessons

- Without "NOT photorealistic" and the explicit cartoon-eye/skin wording, flare drifts to near-photoreal faces that do not match avatar-01..24.
