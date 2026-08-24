# Room Lifecycle

A **room** is a named panel instance: its own roster, its own seats, its own
runs. Rooms never share state, so several can run at the same time.

This workflow covers four things people actually ask for:

1. "Run it again on something else, right now." → **clean**
2. "Swap out some of the people in the room." → **seat bounce / seat refresh**
3. "Give me a second room for a different question." → **room new**
4. "Run five of these at once." → **parallel rooms**

The script owns every file operation. The AI owns dossier CONTENT and nothing
else. Nothing is ever deleted — every removal is a move into `_archive/`.

Set `SKILL_ROOT` to this skill folder. Run `room.sh` from the kit folder.

---

## Where a room lives

```
rooms/
├── DEFAULT              # optional: one line, the default room's name
├── default/             # a room
│   ├── panel.json       # the roster — SEATS (kept by clean)
│   ├── dossiers/        # the seats themselves (kept by clean)
│   ├── owner/           # owner context (kept)
│   ├── evidence/        # source notes (kept)
│   ├── PANEL-BRIEF.md   # the brief (kept)
│   ├── runs/            # KNOWLEDGE (wiped by clean)
│   ├── inputs/          # KNOWLEDGE (wiped by clean)
│   ├── calibration/     # KNOWLEDGE (wiped by clean)
│   ├── _staging/        # authoring prompts waiting for the AI
│   └── _archive/        # everything clean/bounce/refresh moved out
└── pricing-test/        # another room, fully independent
```

**Knowledge vs seats is the distinction this whole workflow exists to make.**
Knowledge is what the room LEARNED from running: runs, results, reactions,
inputs, calibration. Seats are WHO IS IN IT: the roster, the dossiers, the
owner context, the evidence notes. `clean` wipes the first and never touches
the second.

`calibration/` counts as knowledge, not identity. A room that kept calibration
across a wipe would score a new artifact against a previous cycle's outcomes.

---

## 1. Rerun five minutes later — same room, different concept

The most common request. The seats are good; the room just needs to forget what
it already saw so the next artifact gets a genuinely fresh read.

```bash
bash "$SKILL_ROOT/scripts/room.sh" clean --room pricing-test
```

What happens: `runs/`, `inputs/`, and `calibration/` move to
`_archive/<timestamp>/`. The roster and every dossier stay exactly where they
were. Then the script checks the room is rerun-ready and says so.

Always look first if you are unsure:

```bash
bash "$SKILL_ROOT/scripts/room.sh" clean --room pricing-test --list
```

`--list` prints what WOULD move and changes nothing.

After a clean, run this kit's own validation before preparing the next run:

```bash
node "$SKILL_ROOT/scripts/validate-panel.ts" rooms/pricing-test
node "$SKILL_ROOT/scripts/prepare-run.ts" rooms/pricing-test <artifact>
```

**Why clean instead of a new room:** a rerun on the same seats is the same
instrument reading a different artifact, which is what makes two results
comparable. A new room with new seats is a different instrument and its score
is not comparable to the old one.

---

## 2. Seat operations — change who is in the room

### See who is in it

```bash
bash "$SKILL_ROOT/scripts/room.sh" seat list --room pricing-test
```

### Bounce seats (take them out)

```bash
bash "$SKILL_ROOT/scripts/room.sh" seat bounce tech-curious-wrong-fit skeptic-hard-no --room pricing-test
```

Their dossiers move to `_archive/<timestamp>/bounced-seats/` and their roster
entries flip to `"active": false`. The entries stay in the roster — a bounced
seat is recorded, not erased, so a later reader can see the room changed shape.

Bouncing can push a room below this kit's minimum active seat count. That is
intentional: validation will fail until you refresh or add seats, and a failing
gate is the correct state for a room that is not ready.

### Refresh seats (bounce, then rebuild from new criteria)

This is the "make six new ones based on new criteria" move.

```bash
bash "$SKILL_ROOT/scripts/room.sh" seat refresh contractor-owner realtor-broker \
  --criteria "Long Island SMB owners with 10-40 staff who already employ a bookkeeper and an office manager" \
  --room pricing-test
```

The script does the mechanical half, 100% of the time:

- archives each old dossier to `_archive/<timestamp>/refreshed-seats/`;
- sets each seat `"active": false`;
- writes one filled authoring prompt per seat into `_staging/<timestamp>/`,
  naming the exact dossier path to write and carrying the new criteria.

Then the AI does the half only it can do:

1. Open each staged prompt and write the dossier it asks for.
2. Set that seat back to `"active": true`.
3. Run `validate-panel.ts` for the room — it gates the new dossier in on
   length, required headings, evidence and assumption labels, and distinctness
   from the other seats.

`--criteria` is required. Without new criteria there is nothing to rebuild
from, and the script refuses rather than regenerating the same person.

**The script never writes dossier content.** A dossier is the product, and the
kit's dossier standard and validator decide whether it is good enough.

---

## 3. Room operations

```bash
# a second room with the same seats and none of the history
bash "$SKILL_ROOT/scripts/room.sh" room new pricing-test --from default

# an empty room
bash "$SKILL_ROOT/scripts/room.sh" room new brand-new

# every room, its active seat count, its run count
bash "$SKILL_ROOT/scripts/room.sh" room list

# put a whole room away (a move, not a delete)
bash "$SKILL_ROOT/scripts/room.sh" room archive pricing-test
```

`room new --from` clones the seats and takes none of the knowledge. The clone
gets its own roster file, so bouncing a seat in the clone leaves the source room
untouched.

---

## 4. Running several rooms at once

Rooms are independent directories and no command writes outside the room it was
given, so five or six full panels can run at the same time — **on a harness that
can orchestrate subagents (T1)**. Concurrency here means **subagents running
workflows**, one subagent per room, each owning that room end to end. It does
NOT mean `claude -p`, and it does NOT mean backgrounding shell commands with
`&`: a `&` fan-out parallelizes file staging, not panels, and promises
concurrency the kit does not deliver.

Staging the rooms is cheap and sequential either way:

```bash
for name in offer-a offer-b offer-c headline-x headline-y; do
  bash "$SKILL_ROOT/scripts/room.sh" room new "$name" --from default
done
```

Then, per tier:

- **T1** — dispatch one subagent per room, each running the full
  prepare → wash → synthesize workflow against `rooms/<name>` and
  `artifacts/<name>.md`. Rooms complete independently.
- **T2 (shell-only)** — run the rooms one after another, same commands, no
  backgrounding. Identical results, longer wall clock.
- **T3 (chat-only)** — one room at a time, by hand, from the templates.

Rules that make parallel rooms safe:

- **Validation is per room.** Every room you intend to run must pass
  `validate-panel.ts` on its own. A passing room next door proves nothing.
- **One artifact per room.** Comparing rooms is only meaningful when each room
  has the same seats; if you cloned with `--from`, they do.
- **Never point two concurrent commands at the same room.** Two runs in one
  room at the same moment is the one way to get interleaved output.
- **Isolation between rooms is structural** (separate directories), while
  isolation between SEATS is still whatever the runtime provides. The kit's
  existing honesty rule about `sequential-shared-context` being degraded is
  unchanged by rooms.

---

## The default room

A person with one room never types `--room`. Commands fall back to the name in
`rooms/DEFAULT`, or to `default`.

To set it:

```bash
echo "pricing-test" > rooms/DEFAULT
```

---

## Migration from the old flat layout

Earlier installs kept a single panel workspace with no `rooms/` folder — the
roster, dossiers, and runs sat directly in one workspace directory.

To adopt rooms, move that workspace under `rooms/` and give it a name:

```bash
mkdir -p rooms
mv <old-workspace> rooms/default
```

Nothing inside the workspace changes; only its location does. `room.sh` then
finds it, and `--room default` (or no `--room` at all) addresses it.

A flat workspace keeps working with the kit's other scripts exactly as before —
`validate-panel.ts` and `prepare-run.ts` take a workspace path and do not care
whether it sits under `rooms/`. Rooms are additive.

---

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | the command did what it said |
| `1` | the thing under test failed — room not ready, seat not found, bad input |
| `3` | harness error — not in a kit, cannot write, missing directory |

`room.sh` refuses to run outside a kit folder, refuses room names containing
slashes or spaces, and never deletes anything.
