# assets/avatars/

The default faces for a panel report: 31 seat avatars (`avatar-01.jpg` to
`avatar-31.jpg`; 17 women, 14 men), 3 hero images (`hero-01.jpg` to
`hero-03.jpg`), and `avatars.json`, which labels each file `woman` or `man`.
`STYLE.md` holds the prompt for avatar-25 to avatar-31.
3 robot faces (`robot-01.jpg` to `robot-03.jpg`, `"kind": "robot"` and no
`gender` in `avatars.json`; a row without `kind` is a person face) are for
specialist seats only. `STYLE-ROBOTS.md` holds their prompt.

They are generic cartoon composites made by rTech. They are not real people
and do not depict any seat's real-world counterpart.

`scripts/render-report.ts` uses them when a run has no `report-img/` folder.
`gender` is required on buyer, user, and influencer seats in `panel.json`.
`gender` is `woman` or `man`. A seat with `gender` (and `age_band`) gets an
unused face that matches both, else an unused one of its gender. A specialist seat
(`kind: "specialist"`) ignores `gender` and gets an unused robot face; a
panel with more than 3 specialists repeats robots, the only faces that may
repeat. Buyer, user and influencer seats never get a robot. No person face
repeats within a panel: a panel that needs more women than 17, more men than 14,
or more than 31 person faces is refused, and uses `report-img/<seat-id>.jpg` photos.
Per-run photoreal portraits are optional: put `<seat-id>.jpg` and `hero.jpg`
in `<run-folder>/report-img/` and the renderer uses those instead.
