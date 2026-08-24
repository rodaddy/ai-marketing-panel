#!/usr/bin/env bash
# room.sh — panel room lifecycle
#
# A ROOM is a named panel instance: its own roster, its own seats, its own
# runs. Rooms do not share state, so several can run at the same time.
#
# What this script owns (deterministic, 100% of the time):
#   moving files, archiving, staging, listing, validating readiness.
# What this script never does:
#   write a dossier. Dossier CONTENT is authored through the kit's existing
#   seat-authoring workflow; this script stages the prompt and gets out of
#   the way.
#
# Exit grammar: 0 pass · 1 the thing under test failed · 3 harness error.
# Requires: bash and coreutils. Nothing else.

set -u

VERSION="1.0.0"

# ---------------------------------------------------------------- exit codes
EXIT_OK=0
EXIT_FAIL=1
EXIT_HARNESS=3

# ------------------------------------------------------------------- globals
DRY_RUN=0
ROOM_NAME=""
KIT_ROOT=""
ROOMS_DIR=""
STAMP=""

die() { printf 'room: %s\n' "$1" >&2; exit "${2:-$EXIT_HARNESS}"; }
fail() { printf 'room: %s\n' "$1" >&2; exit "$EXIT_FAIL"; }
say() { printf '%s\n' "$1"; }
act() {
  # act <human description> — prints, and in --list mode prints only.
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'WOULD: %s\n' "$1"
    return 1
  fi
  printf 'DID:   %s\n' "$1"
  return 0
}

stamp() { date -u +%Y%m%dT%H%M%SZ; }

# ------------------------------------------------------------ kit root guard
# Refuse to run outside a kit. A kit root is a directory that contains a
# skills/ folder holding a SKILL.md, which every kit in the line has.
find_kit_root() {
  local dir
  dir=$(pwd -P) || die "cannot resolve working directory"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/skills" ] && [ -n "$(find "$dir/skills" -maxdepth 2 -name SKILL.md -print -quit 2>/dev/null)" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir=$(dirname "$dir")
  done
  return 1
}

require_kit_root() {
  KIT_ROOT=$(find_kit_root) || die \
"not inside a kit. room.sh only runs from a kit folder (one holding skills/<name>/SKILL.md).
Change into the kit directory and try again."
  ROOMS_DIR="$KIT_ROOT/rooms"
}

# ------------------------------------------------------------- name checking
valid_name() {
  case "$1" in
    ""|.|..) return 1 ;;
    *[!a-zA-Z0-9._-]*) return 1 ;;
    -*) return 1 ;;
    *) return 0 ;;
  esac
}

require_valid_name() {
  valid_name "$1" || fail \
"room name \"$1\" is not usable. Use letters, digits, dot, dash, underscore — no spaces or slashes."
}

room_dir() { printf '%s/%s\n' "$ROOMS_DIR" "$1"; }

require_room_exists() {
  local d
  d=$(room_dir "$1")
  [ -d "$d" ] || fail "room \"$1\" does not exist. Run: room.sh room list"
}

# The default room. A single-room user never types --room at all.
resolve_room() {
  if [ -n "$ROOM_NAME" ]; then
    printf '%s\n' "$ROOM_NAME"
    return 0
  fi
  if [ -f "$ROOMS_DIR/DEFAULT" ]; then
    local d
    d=$(head -n 1 "$ROOMS_DIR/DEFAULT" | tr -d '\r\n')
    if [ -n "$d" ]; then printf '%s\n' "$d"; return 0; fi
  fi
  printf 'default\n'
}

# --------------------------------------------------------- knowledge vs seats
# THE distinction this whole script exists to make.
#
# KNOWLEDGE (wiped by `clean`) — everything the room learned from running:
#   runs/            prepared and completed runs, reactions, synthesis, scores
#   results/         published results
#   reactions/       loose reactions, if the kit writes them at room level
#   inputs/          the artifact the last run judged
#   calibration/     recorded outcomes from the last cycle
#
# SEATS + CONFIG (never touched by `clean`) — the room's identity:
#   panel.json / panel/panel.json   the roster
#   dossiers/ or panel/dossiers/    the seats themselves
#   owner/, evidence/, PANEL-BRIEF.md, book-profile.md
#
# calibration/ is knowledge because it is a record of a past cycle's outcomes,
# not part of who the seats are. A room that keeps calibration across a wipe is
# scoring a new artifact against an old cycle's outcome record.
KNOWLEDGE_DIRS="runs results reactions inputs calibration"

# Seat roster lives at one of two places depending on kit layout.
roster_path() {
  local rd="$1"
  if [ -f "$rd/panel.json" ]; then printf '%s/panel.json\n' "$rd"; return 0; fi
  if [ -f "$rd/panel/panel.json" ]; then printf '%s/panel/panel.json\n' "$rd"; return 0; fi
  return 1
}

dossiers_dir() {
  local rd="$1"
  if [ -d "$rd/dossiers" ]; then printf '%s/dossiers\n' "$rd"; return 0; fi
  if [ -d "$rd/panel/dossiers" ]; then printf '%s/panel/dossiers\n' "$rd"; return 0; fi
  return 1
}

# A seat's "dossier" path in the roster is relative to the ROSTER's folder, not
# the room root. Flat layout puts panel.json at the room root, so the two are
# the same; the nested layout (panel/panel.json + panel/dossiers/) does not,
# and reading those paths from the room root reports every seat as missing.
dossier_base() {
  local roster
  roster=$(roster_path "$1") || return 1
  dirname "$roster"
}

# ------------------------------------------------------------ roster reading
# Seat ids and their active flag, read with grep/sed only — no jq, no python.
# Emits: <id><TAB><active><TAB><dossier-path>
seat_table() {
  local roster="$1"
  # Flatten to one seat object per line, then pull the three fields.
  tr -d '\n' < "$roster" \
    | sed 's/}[[:space:]]*,[[:space:]]*{/}\
{/g' \
    | grep '"id"' \
    | while IFS= read -r line; do
        case "$line" in *'"dossier"'*) ;; *) continue ;; esac
        local id active dossier
        id=$(printf '%s' "$line" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        active=$(printf '%s' "$line" | sed -n 's/.*"active"[[:space:]]*:[[:space:]]*\([a-z]*\).*/\1/p')
        dossier=$(printf '%s' "$line" | sed -n 's/.*"dossier"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        [ -n "$id" ] || continue
        [ -n "$active" ] || active="unknown"
        printf '%s\t%s\t%s\n' "$id" "$active" "$dossier"
      done
}

seat_exists() {
  # -F: the seat id is a literal string, never a pattern. A stray "\" or "."
  # in a mistyped id must not be interpreted as regex.
  local roster="$1" want="$2"
  seat_table "$roster" | cut -f1 | grep -qxF -- "$want"
}

# Flip a seat's active flag in place, without a JSON parser. Operates on the
# seat object that carries the given id.
set_seat_active() {
  local roster="$1" id="$2" value="$3" tmp
  tmp="$roster.room-tmp.$$"
  awk -v want="$id" -v val="$value" '
    BEGIN { depth = 0 }
    {
      line = $0
      if (line ~ "\"id\"[[:space:]]*:[[:space:]]*\"" want "\"") { inseat = 1 }
      if (inseat && line ~ /"active"[[:space:]]*:/) {
        sub(/"active"[[:space:]]*:[[:space:]]*(true|false)/, "\"active\": " val, line)
        inseat = 0
      }
      print line
    }
  ' "$roster" > "$tmp" || return 1
  # Single-line JSON fallback: the awk pass above needs the fields on their own
  # lines. If nothing changed and the file is one line, do a scoped sed.
  if cmp -s "$roster" "$tmp" ; then
    rm -f "$tmp"
    return 2
  fi
  mv "$tmp" "$roster"
  return 0
}

# ------------------------------------------------------------------ archiving
archive_root() { printf '%s/_archive\n' "$1"; }

# Count real knowledge in a folder. The kit's own marker files (RUNS.md,
# INDEX.md) are structure, not knowledge, so they never make a folder "dirty".
# Globbed rather than piped through ls so odd filenames still count correctly.
knowledge_count() {
  local dir="$1" entry base n=0
  [ -d "$dir" ] || { printf '0\n'; return 0; }
  for entry in "$dir"/* "$dir"/.[!.]*; do
    [ -e "$entry" ] || continue
    base=$(basename "$entry")
    case "$base" in RUNS.md|INDEX.md) continue ;; esac
    n=$((n + 1))
  done
  printf '%s\n' "$n"
}

# ===========================================================================
# COMMAND: clean — THE FIVE-MINUTE PATH
# ===========================================================================
cmd_clean() {
  local room rd arc moved
  room=$(resolve_room)
  require_room_exists "$room"
  rd=$(room_dir "$room")
  STAMP=$(stamp)
  arc="$(archive_root "$rd")/$STAMP"

  say "room:    $room"
  say "path:    $rd"
  say "action:  wipe knowledge, keep seats"
  say ""

  moved=0
  local d content
  for d in $KNOWLEDGE_DIRS; do
    if [ -d "$rd/$d" ]; then
      # Nothing to archive if the folder holds no knowledge — otherwise a
      # second clean would keep making empty archive folders forever.
      content=$(knowledge_count "$rd/$d")
      if [ "$content" -eq 0 ]; then
        say "SKIP:  $d/ is already empty"
        continue
      fi
      if act "archive $d/ -> _archive/$STAMP/$d/"; then
        mkdir -p "$arc" || die "cannot create archive folder"
        mv "$rd/$d" "$arc/$d" || die "cannot archive $d"
        mkdir -p "$rd/$d" || die "cannot recreate $d"
      fi
      moved=$((moved + 1))
    fi
  done

  if [ "$moved" -eq 0 ]; then
    say "room is already clean — nothing to archive."
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    say ""
    say "--list: nothing was moved."
    return $EXIT_OK
  fi

  # Restore the marker files the kit templates ship, so the next run finds the
  # folder shaped the way the kit expects.
  [ -d "$rd/runs" ] && [ ! -f "$rd/runs/RUNS.md" ] && cat > "$rd/runs/RUNS.md" <<'EOF'
# Runs

Each prepared run gets its own immutable folder containing the artifact,
manifest snapshot, seat tasks, reactions, synthesis, scorecard, and result.

Do not edit historical run snapshots when the live panel changes.
EOF

  say ""
  verify_rerun_ready "$rd" "$room"
}

# Post-clean assertion: seats intact, knowledge gone, ready to run again.
verify_rerun_ready() {
  local rd="$1" room="$2" roster dd n_active n_dossier problems
  problems=0
  say "rerun-ready check:"

  roster=$(roster_path "$rd") || { say "  FAIL  no roster (panel.json) in this room"; return $EXIT_FAIL; }
  say "  ok    roster present: ${roster#$rd/}"

  dd=$(dossiers_dir "$rd") || { say "  FAIL  no dossiers/ folder in this room"; return $EXIT_FAIL; }
  n_dossier=$(find "$dd" -maxdepth 1 -name '*.md' ! -name 'DOSSIER-TEMPLATE.md' | wc -l | tr -d ' ')
  say "  ok    dossiers on disk: $n_dossier"

  n_active=$(seat_table "$roster" | awk -F'\t' '$2=="true"' | wc -l | tr -d ' ')
  say "  ok    active seats in roster: $n_active"

  local d left
  for d in $KNOWLEDGE_DIRS; do
    if [ -d "$rd/$d" ]; then
      left=$(knowledge_count "$rd/$d")
      if [ "$left" -ne 0 ]; then
        say "  FAIL  $d/ still holds $left item(s)"
        problems=$((problems + 1))
      else
        say "  ok    $d/ is empty"
      fi
    fi
  done

  if [ "$n_active" -eq 0 ]; then
    say "  FAIL  no active seats — the room cannot run"
    problems=$((problems + 1))
  fi

  if [ "$problems" -ne 0 ]; then
    say ""
    say "NOT rerun-ready: $problems problem(s) above."
    return $EXIT_FAIL
  fi
  say ""
  say "RERUN-READY: seats intact, knowledge cleared."
  say "Next: run the kit's own validate step for this room, then prepare a run."
  return $EXIT_OK
}

# ===========================================================================
# COMMAND: seat list / bounce / refresh
# ===========================================================================
cmd_seat_list() {
  local room rd roster dd base
  room=$(resolve_room); require_room_exists "$room"; rd=$(room_dir "$room")
  roster=$(roster_path "$rd") || fail "room \"$room\" has no roster"
  dd=$(dossiers_dir "$rd") || fail "room \"$room\" has no dossiers folder"
  base=$(dossier_base "$rd")

  say "room: $room"
  printf '%-28s %-8s %s\n' "SEAT" "ACTIVE" "DOSSIER"
  local id active dossier mark
  seat_table "$roster" | while IFS=$(printf '\t') read -r id active dossier; do
    mark=""
    [ -f "$base/$dossier" ] || mark=" (dossier MISSING)"
    printf '%-28s %-8s %s%s\n' "$id" "$active" "$dossier" "$mark"
  done
}

cmd_seat_bounce() {
  local room rd roster arc ids rc base
  ids="$*"
  [ -n "$ids" ] || fail "seat bounce needs at least one seat id. Try: room.sh seat list"
  room=$(resolve_room); require_room_exists "$room"; rd=$(room_dir "$room")
  roster=$(roster_path "$rd") || fail "room \"$room\" has no roster"
  base=$(dossier_base "$rd")
  STAMP=$(stamp)
  arc="$(archive_root "$rd")/$STAMP/bounced-seats"

  say "room: $room"
  local id dossier
  for id in $ids; do
    if ! seat_exists "$roster" "$id"; then
      fail "seat \"$id\" is not in this room's roster. Run: room.sh seat list"
    fi
  done

  for id in $ids; do
    dossier=$(seat_table "$roster" | awk -F'\t' -v w="$id" '$1==w {print $3}')
    if act "bounce seat $id (active=false, archive $dossier)"; then
      mkdir -p "$arc" || die "cannot create archive folder"
      if [ -f "$base/$dossier" ]; then
        mv "$base/$dossier" "$arc/$(basename "$dossier")" || die "cannot archive dossier for $id"
      fi
      set_seat_active "$roster" "$id" "false"; rc=$?
      if [ "$rc" -eq 2 ]; then
        say "       note: $id was already inactive in the roster"
      elif [ "$rc" -ne 0 ]; then
        die "cannot update roster for $id"
      fi
    fi
  done

  if [ "$DRY_RUN" -eq 0 ]; then
    say ""
    say "Bounced. Dossiers archived under _archive/$STAMP/bounced-seats/."
    say "The roster still lists these seats with active=false — nothing was deleted."
    say "Run the kit's validate step; a room below its minimum active seat count"
    say "will fail that gate until you refresh or add seats."
  fi
}

cmd_seat_refresh() {
  local room rd roster arc criteria ids id dossier stagedir rc base
  criteria=""
  ids=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --criteria) criteria="${2:-}"; shift 2 ;;
      --criteria=*) criteria="${1#--criteria=}"; shift ;;
      *) ids="$ids $1"; shift ;;
    esac
  done
  ids=$(printf '%s' "$ids" | sed 's/^ *//')
  [ -n "$ids" ] || fail "seat refresh needs at least one seat id. Try: room.sh seat list"
  [ -n "$criteria" ] || fail \
"seat refresh needs --criteria \"...\". That text is what the new dossier gets
written from; without it the authoring step has nothing new to work from."

  room=$(resolve_room); require_room_exists "$room"; rd=$(room_dir "$room")
  roster=$(roster_path "$rd") || fail "room \"$room\" has no roster"
  base=$(dossier_base "$rd")
  STAMP=$(stamp)
  arc="$(archive_root "$rd")/$STAMP/refreshed-seats"
  stagedir="$rd/_staging/$STAMP"

  for id in $ids; do
    seat_exists "$roster" "$id" || fail "seat \"$id\" is not in this room's roster. Run: room.sh seat list"
  done

  say "room:     $room"
  say "criteria: $criteria"
  say ""

  for id in $ids; do
    dossier=$(seat_table "$roster" | awk -F'\t' -v w="$id" '$1==w {print $3}')
    if act "refresh seat $id (archive old dossier, stage authoring prompt)"; then
      mkdir -p "$arc" "$stagedir" || die "cannot create staging folders"
      if [ -f "$base/$dossier" ]; then
        # One move, not a copy plus a delete: the old dossier goes to the
        # archive and nothing is left behind for the authoring step to
        # mistake for the current seat.
        mv "$base/$dossier" "$arc/$(basename "$dossier")" \
          || die "cannot archive dossier for $id"
      fi
      set_seat_active "$roster" "$id" "false"; rc=$?
      [ "$rc" -eq 0 ] || [ "$rc" -eq 2 ] || die "cannot update roster for $id"
      write_authoring_prompt "$stagedir/$id.md" "$id" "$dossier" "$criteria" "$room" "$arc" "$base"
    fi
  done

  if [ "$DRY_RUN" -eq 0 ]; then
    say ""
    say "Staged $(printf '%s' "$ids" | wc -w | tr -d ' ') authoring prompt(s):"
    say "  $stagedir"
    say ""
    say "NEXT (this is the AI's job, not this script's):"
    say "  1. Open each staged prompt and write the dossier it asks for, to the"
    say "     dossier path named inside it."
    say "  2. Set that seat back to \"active\": true in the roster."
    say "  3. Run the kit's validate step for this room. It gates the new"
    say "     dossier in — length, required headings, evidence and assumption"
    say "     labels, and distinctness from the other seats."
    say ""
    say "The old dossiers are in _archive/$STAMP/refreshed-seats/ if you want them back."
  fi
}

write_authoring_prompt() {
  local out="$1" id="$2" dossier="$3" criteria="$4" room="$5" arc="$6" base="$7"
  local target
  # Name the real write path, which differs between the flat and nested
  # layouts. An authoring step told the wrong path writes an orphan file.
  target="${base#$KIT_ROOT/}/$dossier"
  cat > "$out" <<EOF
# Seat authoring prompt — $id

Generated by room.sh on $STAMP. This file is a WORK ORDER for the AI, not a
dossier. Nothing here is a finished seat.

## What to do

Write a full seat dossier for \`$id\` and save it to:

    $target

Then set that seat's \`"active"\` back to \`true\` in the room's roster, and run
the kit's validate step for this room.

## New criteria for this seat

$criteria

## Rules that still apply

- Follow the kit's own dossier standard (\`references/dossier-standard.md\`) and
  its seat-authoring workflow. This prompt does not replace them.
- Every required heading the validator checks must be present and substantive.
- Separate what is evidence-backed from what is modeled. Label both.
- This seat must be materially different from every other seat in the room. The
  validator rejects near-identical dossiers, and it is right to.
- Do not copy the archived dossier and edit adjectives. The point of a refresh
  is a seat built from the NEW criteria above.

## The seat this replaces

The previous dossier is archived at:

    ${arc#$KIT_ROOT/}/$(basename "$dossier")

Read it if it helps you avoid repeating the same person. Do not treat it as a
starting draft.

## When you are done

The room is not rerun-ready until the validator passes. If validation fails,
fix the dossier — do not lower the gate.
EOF
}

# ===========================================================================
# COMMAND: room new / list / archive
# ===========================================================================
cmd_room_new() {
  local name from src dst roster
  name="${1:-}"
  shift 2>/dev/null || true
  from=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) from="${2:-}"; shift 2 ;;
      --from=*) from="${1#--from=}"; shift ;;
      *) fail "unknown option for room new: $1" ;;
    esac
  done
  [ -n "$name" ] || fail "room new needs a name. Example: room.sh room new pricing-test"
  require_valid_name "$name"
  dst=$(room_dir "$name")
  [ -e "$dst" ] && fail "room \"$name\" already exists at $dst"

  if [ -n "$from" ]; then
    require_valid_name "$from"
    require_room_exists "$from"
    src=$(room_dir "$from")
    if act "create room $name by cloning seats from $from (zero knowledge)"; then
      mkdir -p "$dst" || die "cannot create room"
      # Copy everything that is NOT knowledge and NOT archive/staging.
      local entry base
      for entry in "$src"/* "$src"/.[!.]*; do
        [ -e "$entry" ] || continue
        base=$(basename "$entry")
        case " $KNOWLEDGE_DIRS " in *" $base "*) continue ;; esac
        case "$base" in _archive|_staging) continue ;; esac
        cp -R "$entry" "$dst/$base" || die "cannot copy $base"
      done
      # Recreate empty knowledge folders that the source had.
      local d
      for d in $KNOWLEDGE_DIRS; do
        [ -d "$src/$d" ] && mkdir -p "$dst/$d"
      done
      [ -d "$dst/runs" ] && cat > "$dst/runs/RUNS.md" <<'EOF'
# Runs

Each prepared run gets its own immutable folder containing the artifact,
manifest snapshot, seat tasks, reactions, synthesis, scorecard, and result.

Do not edit historical run snapshots when the live panel changes.
EOF
      say ""
      say "Room \"$name\" created with $from's seats and no knowledge."
      say "It has its own roster: edits here do not touch \"$from\"."
      roster=$(roster_path "$dst") && say "roster: ${roster#$KIT_ROOT/}"
    fi
  else
    if act "create empty room $name"; then
      mkdir -p "$dst" || die "cannot create room"
      local d
      for d in $KNOWLEDGE_DIRS; do mkdir -p "$dst/$d"; done
      say ""
      say "Empty room \"$name\" created at $dst"
      say "Next: run the kit's init/setup step pointed at this room to lay in a roster,"
      say "or clone an existing room with: room.sh room new $name --from <existing>"
    fi
  fi
}

cmd_room_list() {
  local d name roster rd active runs default
  if [ ! -d "$ROOMS_DIR" ]; then
    say "No rooms yet. Create one with: room.sh room new <name>"
    return $EXIT_OK
  fi
  default=$(resolve_room)
  printf '%-22s %-8s %-6s %s\n' "ROOM" "SEATS" "RUNS" "STATE"
  for d in "$ROOMS_DIR"/*; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    case "$name" in _archive) continue ;; esac
    active="-"
    if roster=$(roster_path "$d"); then
      active=$(seat_table "$roster" | awk -F'\t' '$2=="true"' | wc -l | tr -d ' ')
    fi
    runs=0
    [ -d "$d/runs" ] && runs=$(find "$d/runs" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
    local state="ready"
    [ "$active" = "-" ] && state="no roster"
    [ "$active" = "0" ] && state="no active seats"
    [ "$name" = "$default" ] && state="$state (default)"
    printf '%-22s %-8s %-6s %s\n' "$name" "$active" "$runs" "$state"
  done
}

cmd_room_archive() {
  local name src arc
  name="${1:-}"
  [ -n "$name" ] || fail "room archive needs a name. Run: room.sh room list"
  require_valid_name "$name"
  require_room_exists "$name"
  src=$(room_dir "$name")
  STAMP=$(stamp)
  arc="$ROOMS_DIR/_archive/$STAMP"
  if act "archive whole room $name -> rooms/_archive/$STAMP/$name/"; then
    mkdir -p "$arc" || die "cannot create archive folder"
    mv "$src" "$arc/$name" || die "cannot archive room"
    say ""
    say "Room \"$name\" archived, not deleted. It is at:"
    say "  $arc/$name"
    say "Move it back to $ROOMS_DIR/$name to restore it."
  fi
}

# ===========================================================================
# usage
# ===========================================================================
usage() {
  cat <<'EOF'
room.sh — panel room lifecycle

A ROOM is a named panel instance with its own seats and its own runs. Rooms
never share state, so several can run at the same time.

USAGE
  room.sh <command> [options]

THE FIVE-MINUTE PATH
  room.sh clean [--room NAME]
      Wipe what the room LEARNED, keep who is IN it. Archives runs, results,
      reactions, inputs, and calibration into _archive/<stamp>/; leaves the
      roster, the dossiers, the owner context, and the evidence notes exactly
      where they were. Then checks the room is ready to run again.
      Nothing is ever deleted.

SEAT OPERATIONS
  room.sh seat list [--room NAME]
      Every seat, whether it is active, and where its dossier lives.

  room.sh seat bounce <id> [<id>...] [--room NAME]
      Take these seats out: archive their dossiers, set active=false.
      The roster keeps the entries. Nothing is deleted.

  room.sh seat refresh <id> [<id>...] --criteria "..." [--room NAME]
      Bounce these seats AND stage one authoring prompt per seat, filled with
      the new criteria. The AI writes the dossier from the prompt; this script
      never writes dossier content. The kit's validate step gates it back in.

ROOM OPERATIONS
  room.sh room new <name> [--from EXISTING]
      New named room. With --from, clone the seats and take none of the
      knowledge.
  room.sh room list
      Every room, its active seat count, and its run count.
  room.sh room archive <name>
      Move a whole room into rooms/_archive/<stamp>/. Not a delete.

GLOBAL OPTIONS
  --room NAME   Which room to act on. Defaults to the name in rooms/DEFAULT,
                or "default".
  --list        Dry run. Print what WOULD happen and change nothing.
  --help        This text.
  --version     Print version.

RUNNING SEVERAL ROOMS AT ONCE
  Rooms are independent directories, so five or six can run in parallel. Each
  run lands under its own room, and no command writes outside the room it was
  given. The kit's validate step is per-room and must pass for each room you
  intend to run.

EXIT CODES
  0  the command did what it said
  1  the thing under test failed (room not ready, seat not found, bad input)
  3  harness error (not in a kit, cannot write, missing directory)
EOF
}

# ===========================================================================
# argument parsing
# ===========================================================================
main() {
  local cmd sub

  # Pull global flags out first so they can appear anywhere. Arguments are
  # rebuilt with "set --" so values containing spaces survive intact; a
  # space-joined string here would shred --criteria "two words".
  local -a positional=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --list|--dry-run) DRY_RUN=1; shift ;;
      --room) ROOM_NAME="${2:-}"; shift 2 ;;
      --room=*) ROOM_NAME="${1#--room=}"; shift ;;
      --help|-h) usage; exit $EXIT_OK ;;
      --version) printf 'room.sh %s\n' "$VERSION"; exit $EXIT_OK ;;
      *) positional+=("$1"); shift ;;
    esac
  done

  if [ "${#positional[@]}" -gt 0 ]; then
    set -- "${positional[@]}"
  else
    set --
  fi

  [ $# -ge 1 ] || { usage; exit $EXIT_HARNESS; }

  if [ -n "$ROOM_NAME" ]; then require_valid_name "$ROOM_NAME"; fi

  cmd="$1"; shift

  case "$cmd" in
    help) usage; exit $EXIT_OK ;;
    version) printf 'room.sh %s\n' "$VERSION"; exit $EXIT_OK ;;
  esac

  require_kit_root

  case "$cmd" in
    clean)
      [ $# -eq 0 ] || fail "clean takes no arguments (did you mean --room $1 ?)"
      cmd_clean
      ;;
    seat)
      sub="${1:-}"; shift 2>/dev/null || true
      case "$sub" in
        list) cmd_seat_list ;;
        bounce) cmd_seat_bounce "$@" ;;
        refresh) cmd_seat_refresh "$@" ;;
        ""|*) fail "seat needs a subcommand: list, bounce, or refresh" ;;
      esac
      ;;
    room)
      sub="${1:-}"; shift 2>/dev/null || true
      case "$sub" in
        new) cmd_room_new "$@" ;;
        list) cmd_room_list ;;
        archive) cmd_room_archive "$@" ;;
        ""|*) fail "room needs a subcommand: new, list, or archive" ;;
      esac
      ;;
    *)
      fail "unknown command \"$cmd\". Run room.sh --help"
      ;;
  esac
}

main "$@"
