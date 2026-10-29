#!/usr/bin/env node
// Render one self-contained REPORT.html for a validated run. Deterministic: no AI, no network.
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { canonicalDirectory, ISOLATED_MODES, resolveReadWithin, SHARED_CONTEXT_MODE } from "./lib.ts";
import { dataUri, esc, firstSentence, loadRun, parseArgs, quoteFor, refuseInvalid, type Rec } from "./run-view.ts";

const FITS = ["core", "adjacent", "wrong-fit", "hard-no"];
// A buyer REACTION that opens "VERSION: 2." or "VERSION: NEITHER." names that seat's choice (workflows/wash-artifact.md).
// The label runs to whitespace or a closing period, so "1.1" and "1.2" stay distinct and "2." is "2".
const VERSION_VOTE = /^VERSION:\s*([A-Za-z0-9][A-Za-z0-9.\-]*?)(?=[.,;:]?(?:\s|$))/;

function section(markdown: string, heading: string | RegExp): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => (typeof heading === "string" ? line.trim() === `## ${heading}` : /^## /.test(line) && heading.test(line.slice(3))));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^#{1,2} /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

// Escape first, then turn `code` spans into <code>, so no raw HTML gets through.
const inline = (text: string): string => esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");

// shortcut: paragraphs, "- " and "1." lists (indented lines continue the item), "### " headings and inline code only, for RESULT.md and dossiers; upgrade if either grows tables, bold or nested lists.
function prose(markdown: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: string; items: string[] } | null = null;
  const flush = (): void => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`);
    para = [];
    list = null;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const item = line.match(/^\s*(?:([-*])|\d+\.) +(.*)$/);
    if (!line.trim()) flush();
    else if (/^### /.test(line)) {
      flush();
      out.push(`<h5>${inline(line.slice(4).trim())}</h5>`);
    } else if (item) {
      const tag = item[1] ? "ul" : "ol";
      if (para.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push(item[2]);
    } else if (list && /^\s/.test(line)) list.items[list.items.length - 1] += ` ${line.trim()}`;
    else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join("\n");
}

const SHOWN = [["REACTION", "Reaction"], ["LANDS", "Lands"], ["RESISTS", "Resists"], ["MISSING", "Missing"], ["CHANGE", "Change"]];
const HIDDEN = new Set(["SEAT_ID", "DECISION", "INTENSITY", "GATE", "CONFIDENCE", ...SHOWN.map(([key]) => key)]);
// A specialist GATE value in reader words; the GATE field itself is never shown as a label.
const checkLabel = (value: string): string => `Overview: ${value === "PASS" ? "passed" : value === "FLAG" ? "needs fixes" : value === "NOT-APPLICABLE" ? "not applicable" : value.toLowerCase()}`;
const titleCase = (key: string): string => key.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

// Each "## " section becomes an <h4> plus body; the "# " title line is dropped and each lead line (Seat ID, Kind, Fit) is its own <p>.
function dossierHtml(markdown: string): string {
  const [lead, ...parts] = markdown.split(/^## /m);
  const intro = lead.split(/\r?\n/).filter((line) => line.trim() && !/^# /.test(line)).map((line) => `<p class="lead">${inline(line.trim())}</p>`).join("");
  return intro + parts.map((part) => {
    const [heading, ...body] = part.split(/\r?\n/);
    return `<h4>${esc(heading.trim())}</h4>\n${prose(body.join("\n").trim())}`;
  }).join("\n");
}

// The artifact keeps its own headings: "# " becomes <h3>, "## " <h4>, the rest goes through prose().
function artifactHtml(markdown: string): string {
  return markdown.split(/^(?=#{1,2} )/m).map((part) => {
    const head = part.match(/^(#{1,2}) (.*)/);
    const body = prose((head ? part.slice(head[0].length) : part).trim());
    return head ? `<h${head[1].length + 2}>${inline(head[2].trim())}</h${head[1].length + 2}>\n${body}` : body;
  }).join("\n");
}

// A version heading is "## Version <word>", not "## Versioning" or "## Version history".
const VERSION_HEADING = /^## Version[ \t]+(?!history\b)\S/;

// Two columns only for exactly two version headings and no "## " before the first; a column runs to the next
// version heading, so the "## " sections inside each version stay in it. The preamble ("# " title, intro) sits above.
function artifactColumns(markdown: string, label: string): string {
  const parts = markdown.split(new RegExp(`(?=${VERSION_HEADING.source})`, "m"));
  const [preamble, ...versions] = VERSION_HEADING.test(parts[0]) ? ["", ...parts] : parts;
  const two = versions.length === 2 && !/^## /m.test(preamble);
  const columns = two ? versions.map((part) => [part.match(/^## (.*)/)![1].trim(), part.replace(/^## .*\r?\n?/, "")]) : [[label, markdown]];
  const lead = two && preamble.trim() ? `<div class="doc">${artifactHtml(preamble)}</div>` : "";
  return `${lead}<div class="${two ? "versions" : ""}">${columns.map(([title, body]) => `<details class="ver" open><summary>${esc(title)}</summary><div class="doc">${artifactHtml(body)}</div></details>`).join("")}</div>`;
}

const CSS = `
:root{--garnet:#641220;--gold:#b8860b;--gold-text:#8c6608;--gold-soft:#f0d9a8;--bg:#f5f2ee;--paper:#fff;--ink:#1a1a1a;--subtext:#666;--line:#ddd6cc;--yes:#2e7d40;--no:#8a1f1f;--nei:#8d857b;--v1:#2f6db0;--v2:#2e7d40;--pend-bg:#f4e3c0;--pend-fg:#7a5a00;--shadow:0 1px 4px rgba(0,0,0,.06);--font:"Helvetica Neue",Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 var(--font)}
.wrap{max-width:1240px;margin:0 auto;padding:0 32px}
section{padding:64px 0 8px}
.eyebrow{font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-text);margin:0 0 10px}
h2.sec{font-size:34px;margin:0 0 10px;letter-spacing:-.01em}
.rule{height:4px;width:64px;background:var(--garnet);border:0;margin:0 0 18px}
.hero{position:relative;min-height:560px;display:flex;align-items:flex-end;color:#f7f1e8;background:#1c1a18 center/cover no-repeat}
.hero::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(18,14,12,.92) 0%,rgba(18,14,12,.72) 42%,rgba(18,14,12,.15) 75%),linear-gradient(0deg,rgba(18,14,12,.85) 0%,rgba(18,14,12,0) 45%)}
.hero .wrap{position:relative;width:100%;padding-top:96px;padding-bottom:56px}
.hero .q{font-size:18px;color:var(--gold-soft);margin:0 0 12px;font-weight:700}
.hero h1{font-size:40px;line-height:1.15;margin:0 0 22px;max-width:860px;color:#fff}
.hero h1 em{font-style:normal;color:#f0d9a8}
.brand{position:absolute;top:28px;left:32px;z-index:1;font-weight:700;letter-spacing:.02em;max-width:calc(100% - 220px);overflow-wrap:anywhere}
.hero .more{font-size:17px;color:#d9cfc2;margin:-10px 0 22px;max-width:860px}
.verdict{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.pill{display:inline-flex;gap:10px;align-items:center;background:var(--garnet);color:#fff;border-radius:999px;padding:10px 20px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:15px;box-shadow:0 0 0 2px #b8445a}
.stat{background:rgba(255,255,255,.08);border:1px solid rgba(240,217,168,.25);border-radius:8px;padding:10px 18px}
.stat b{display:block;font-size:28px;color:#fff;line-height:1.1}.stat span{font-size:13px;color:#d9cfc2}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:24px}
.seat{background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column}
.portrait{position:relative;flex:none;aspect-ratio:4/3;overflow:hidden;background:var(--line)}
.portrait img{width:100%;height:100%;object-fit:cover;object-position:50% 25%;display:block}
.badge{position:absolute;top:14px;right:14px;border-radius:999px;padding:6px 14px;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:#5d564f}
.seat.gate{grid-column:1/-1;flex-direction:row}.seat.gate .portrait{flex:0 0 240px;width:240px;height:240px;align-self:flex-start}.gatewhy{margin:6px 0;font-size:15px;color:var(--subtext)}.gaterun{margin:0 0 6px;font-weight:700;color:var(--garnet)}.yn{display:block;margin-top:6px;font-size:13px;color:var(--subtext)}@media (max-width:640px){.seat.gate{flex-direction:column}.seat.gate .portrait{flex:none;width:auto;height:auto;align-self:stretch;aspect-ratio:4/3}}
.badge.yes{background:var(--yes)}.badge.no{background:var(--no)}.badge.gate{background:var(--garnet)}
.seat-body{padding:20px 22px 22px;display:flex;flex-direction:column;flex:1}
.role{margin:0;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-text)}
.seat h3{margin:4px 0 4px;font-size:21px}
.who{margin:0 0 14px;color:var(--subtext);font-size:14px}
blockquote{margin:0 0 14px;padding:4px 0 4px 16px;border-left:4px solid var(--garnet);font-size:17px;line-height:1.45}
details{border-top:1px solid var(--line);padding:10px 0 0;margin-top:auto}
summary{cursor:pointer;font-weight:700;color:var(--gold-text);font-size:14.5px}
.rx dt{font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-text);margin-top:12px}
.rx dd{margin:2px 0 0;font-size:14.5px}
.doc{font-size:14.5px;margin-top:10px}.doc h4{font-size:15px;margin:18px 0 6px}.doc h5{font-size:14px;margin:12px 0 4px}.doc p.lead{margin:0}
code{font:13px Menlo,Consolas,monospace;background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:0 4px}
.runlines{margin:0;padding-left:20px;max-width:880px}.runlines li{margin:6px 0}
.caption{font-size:13px;color:var(--subtext);margin:18px 0 0;font-style:italic}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:28px 30px;box-shadow:var(--shadow)}
.vrow{display:grid;grid-template-columns:200px 1fr;gap:18px;align-items:center;margin:12px 0}
.vbar{display:flex;height:36px;border-radius:6px;overflow:hidden;background:var(--line)}
.seg{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;white-space:nowrap}
.seg.yes{background:var(--yes)}.seg.no{background:var(--no)}
.cons{display:flex;gap:28px;margin-top:18px;color:var(--subtext)}.cons b{color:var(--ink);font-size:22px}
.srow{display:grid;grid-template-columns:260px 1fr 150px;gap:20px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}
.track{height:12px;background:var(--line);border-radius:999px;overflow:hidden}.track i{display:block;height:100%;background:var(--gold)}
.total{font-size:64px;font-weight:700;line-height:1}
.versions{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
.ver{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:20px 24px;margin-top:0}.ver summary{font-size:18px;color:var(--ink)}.ver .doc h3{font-size:20px;margin:18px 0 6px}
.changes ol{margin:0;padding-left:22px}.changes li{margin:8px 0}
.hero .why{max-width:640px;font-size:17px;color:#e9e1d6;margin:22px 0 0}
.pill b{font-size:22px;letter-spacing:0}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}.stats .stat{padding:12px 18px;min-width:150px}
table.t{border-collapse:collapse;width:100%;font-size:14px;margin-top:12px}
table.t th,table.t td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
table.t th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--subtext)}
.fixes{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.fix{background:var(--paper);border:1px solid var(--line);border-top:4px solid var(--garnet);border-radius:12px;padding:26px}
.fix .k{display:inline-flex;width:44px;height:44px;border-radius:50%;background:var(--garnet);color:#fff;align-items:center;justify-content:center;font-size:20px;font-weight:700;margin-bottom:14px}
.fix h3{margin:0 0 8px;font-size:19px}.fix p{margin:0;color:var(--subtext)}
.dissent{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}
.dq{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:22px 24px;position:relative}
.dq::before{content:"\\201C";position:absolute;top:-6px;right:18px;font-size:84px;line-height:1;color:var(--gold);opacity:.35;font-family:Georgia,serif}
.dq .code{font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--gold-text)}
.dq p{margin:6px 0 10px;font-size:16px}.dq .who{margin:0;font-size:13px}
footer.band{margin-top:80px;background:#1c1a18;color:#f2ece4;padding:56px 0 40px}
footer.band .eyebrow{color:#e2b955}footer.band h2{color:#f0d9a8;font-size:30px;margin:0 0 10px}
footer.band p{max-width:820px;color:#d9cfc2;font-size:17px}
footer.band .small{font-size:13px;color:#b3a79c;margin-top:32px}
footer.band .rule{background:#b8445a}
@media (max-width:900px){.fixes{grid-template-columns:1fr}}
.dl{background:var(--garnet);color:#fff;border:0;border-radius:999px;padding:10px 20px;font:700 14px var(--font);cursor:pointer;position:absolute;top:22px;right:32px;z-index:1;box-shadow:0 0 0 2px #b8445a}
.big{display:flex;flex-wrap:wrap;gap:28px;align-items:center;margin-bottom:28px}.big .num{font-size:76px;font-weight:700;line-height:1}.big .num small{font-size:28px;color:var(--subtext)}
.allbar{display:flex;height:56px;border-radius:8px;overflow:hidden;flex:1;min-width:280px}
.seg{padding:0 8px}
.legend{display:flex;gap:18px;font-size:13.5px;color:var(--subtext);margin-top:18px;flex-wrap:wrap}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.gatenote{margin-top:20px;padding:14px 18px;border-radius:8px;background:var(--pend-bg);color:var(--pend-fg);font-size:15px}
nav.tabs{position:sticky;top:0;z-index:50;background:#1c1a18;border-bottom:1px solid #3b3632;overflow-x:auto;white-space:nowrap}
nav.tabs .wrap{display:flex;gap:4px;height:48px;align-items:center}
nav.tabs a{flex:none;color:#d9cfc2;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.04em;padding:6px 14px;border-radius:999px}
nav.tabs a.on{background:var(--garnet);color:#fff}
section,footer.band{scroll-margin-top:48px}
.fixbtn{background:var(--garnet);color:#fff;border:0;border-radius:999px;padding:7px 16px;font:700 13px var(--font);cursor:pointer;margin-top:16px;box-shadow:0 0 0 2px #b8445a}
.fixall{margin:0 0 18px}.fixall .fixbtn{margin-top:0}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100;background:#1c1a18;color:#f2ece4;padding:12px 20px;border-radius:999px;font-size:14px}
.promptbox{width:min(720px,90vw);border:1px solid var(--line);border-radius:12px;padding:20px}.promptbox textarea{width:100%;height:260px;font:13px/1.5 ui-monospace,monospace}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.dl,nav.tabs,.fixbtn,.fixall,.toast,.promptbox{display:none}.seat,.seat.gate,.panel,.srow,.vrow,table.t tr,.fix,.dq,.stat,.big,.allbar,.legend,.gatenote,footer.band{break-inside:avoid;page-break-inside:avoid}section{padding-top:24px}.hero{min-height:420px}}
`;

async function main(): Promise<void> {
  const { runDir, out } = parseArgs("render-report.ts", "REPORT.html");
  refuseInvalid(runDir, "render-report");
  const { snapshot, outcome, copy, seats, reactions, imageFor, heroPath } = await loadRun(runDir, "render-report");
  const resultMd = await readFile(join(runDir, "RESULT.md"), "utf8");
  const run = JSON.parse(await readFile(join(runDir, "RUN.json"), "utf8")) as Rec;
  // Dossiers resolve against <workspace>/runs/<run>; any other layout shows no dossier rather than guessing a root.
  const underRuns = basename(dirname(runDir)) === "runs";
  if (!underRuns) console.error(`render-report: warning, run is not under <workspace>/runs/; dossiers not shown`);
  const workspace = underRuns ? await canonicalDirectory(join(runDir, "..", ".."), "panel workspace") : "";

  // Specialist seats render first, each in its own full-width gate card, so a gate never reads as a buyer.
  const gateCards: string[] = [];
  const cards: string[] = [];
  for (const seat of seats) {
    const fields = reactions.get(seat.id);
    const specialist = seat.kind === "specialist";
    const verdict = !fields ? "NO REACTION" : specialist ? checkLabel(fields.get("GATE") ?? "") : fields.get("DECISION") ?? "";
    const badge = !fields ? "" : specialist ? "gate" : verdict === "YES" ? "yes" : "no";
    const quote = quoteFor(copy, seat.id, fields);
    const [source, uri] = await imageFor(seat.id);
    const rows = fields
      ? [...SHOWN.map(([key, label]) => [label, fields.get(key) ?? ""]), ...[...fields].filter(([key]) => !HIDDEN.has(key)).map(([key, value]) => [titleCase(key), value])]
      : [];
    const full = fields
      ? `<details><summary>Full reaction</summary><dl class="rx">${rows.filter(([, value]) => value.trim()).map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl></details>`
      : "";
    let doc: string;
    try {
      if (!underRuns) throw new Error("run is not under <workspace>/runs/");
      doc = dossierHtml(await readFile(await resolveReadWithin(workspace, String(seat.dossier ?? "")), "utf8"));
    } catch (error) {
      if (underRuns) console.error(`render-report: warning, ${seat.id} dossier: ${error instanceof Error ? error.message : String(error)}`);
      doc = "<p>Dossier not available in this workspace.</p>";
    }
    const dossier = `<details><summary>Full dossier (current workspace copy)</summary><div class="doc">${doc}</div></details>`;
    if (specialist) {
      const thisRun = fields?.get("GATE") === "FLAG" && outcome.result?.decision ? `<p class="gaterun">This run: needs fixes → verdict ${esc(outcome.result.decision)}.</p>` : "";
      gateCards.push(`<article class="seat gate"><div class="portrait"><img data-avatar="${esc(source)}" src="${uri}" alt="Illustrative composite for ${esc(seat.id)}"><span class="badge ${badge}">${esc(verdict)}</span></div>
<div class="seat-body"><p class="role">Panel overview · not a buyer</p><h3>${esc(seat.name)}</h3><p class="gatewhy">Panel overview, not a buyer. It answers passed or needs fixes instead of YES or NO, and needs fixes caps the verdict.</p>${thisRun}<blockquote>${esc(quote)}</blockquote>${full}${dossier}</div></article>`);
      continue;
    }
    cards.push(`<article class="seat"><div class="portrait"><img data-avatar="${esc(source)}" src="${uri}" alt="Illustrative composite for ${esc(seat.id)}"><span class="badge ${badge}">${esc(verdict)}</span></div>
<div class="seat-body"><p class="role">${esc(seat.kind)} · ${esc(seat.fit)}</p><h3>${esc(seat.name)}</h3><p class="who">${esc(seat.id)}</p><blockquote>${esc(quote)}</blockquote>${full}${dossier}</div></article>`);
  }

  // Version vote: only when EVERY buyer reaction opens "VERSION: <label>" (label a version or NEITHER); else the YES/NO bars.
  const buyerSeats = seats.filter((seat) => seat.kind !== "specialist" && reactions.has(seat.id));
  const choiceOf = new Map<string, string>();
  for (const seat of buyerSeats) {
    const match = (reactions.get(seat.id)?.get("REACTION") ?? "").match(VERSION_VOTE);
    if (match) choiceOf.set(seat.id, match[1].toUpperCase());
  }
  const versionVote = buyerSeats.length > 0 && choiceOf.size === buyerSeats.length;
  const countFor = (choice: string): number => [...choiceOf.values()].filter((value) => value === choice).length;
  // Colours follow the sorted labels (V1 blue, V2 green as in v2); bars and legend run from the most-picked version down.
  const versionLabels = [...new Set(choiceOf.values())].filter((choice) => choice !== "NEITHER").sort();
  const named = [...versionLabels].sort((a, b) => countFor(b) - countFor(a));
  const choices = [...named, ...(versionVote && [...choiceOf.values()].includes("NEITHER") ? ["NEITHER"] : [])];
  // shortcut: six version colours, a 7th version reuses V1's; add colours if a run ever compares more than six versions.
  const VERSION_COLOURS = ["var(--v1)", "var(--v2)", "var(--gold)", "var(--garnet)", "#6a4c93", "#1f7a80"];
  const colourOf = (choice: string): string => (choice === "NEITHER" ? "var(--nei)" : VERSION_COLOURS[versionLabels.indexOf(choice) % VERSION_COLOURS.length]);
  const yesNo = (group: typeof seats): string => `<small class="yn">YES ${group.filter((seat) => reactions.get(seat.id)?.get("DECISION") === "YES").length} · NO ${group.filter((seat) => reactions.get(seat.id)?.get("DECISION") === "NO").length}</small>`;
  const choiceName = (choice: string, long = false): string => (choice === "NEITHER" ? "Neither" : `${long ? "Version " : "V"}${choice}`);
  const choiceSegs = (group: typeof seats, long = false): string => choices.map((choice) => {
    const n = group.filter((seat) => choiceOf.get(seat.id) === choice).length;
    return n ? `<span class="seg" style="flex:${n};background:${colourOf(choice)}">${n} ${esc(choiceName(choice, long))}</span>` : "";
  }).join("");
  const maxGroup = Math.max(1, ...FITS.map((fit) => buyerSeats.filter((seat) => seat.fit === fit).length));
  const ranked = named.map(countFor);
  const versionHead = versionVote
    ? `<div class="big"><div class="num">${ranked.length >= 2 ? `${ranked[0]}<small> to ${ranked[1]}</small>` : ranked.length === 1 ? `${ranked[0]}<small> of ${buyerSeats.length}</small>` : `${buyerSeats.length}<small> Neither</small>`}</div><div><div class="allbar">${choiceSegs(buyerSeats, true)}</div>${yesNo(buyerSeats)}</div></div>`
    : "";
  const legend = versionVote ? `<div class="legend">${choices.map((choice) => `<span><i style="background:${colourOf(choice)}"></i>${esc(choiceName(choice, true))}</span>`).join("")}</div>` : "";
  const voteRows = FITS.map((fit) => {
    const group = seats.filter((seat) => seat.fit === fit && seat.kind !== "specialist" && reactions.has(seat.id));
    if (group.length === 0) return "";
    if (versionVote) return `<div class="vrow"><div><b>${esc(fit)}</b><br><small>${group.length} seat${group.length === 1 ? "" : "s"}</small></div><div><div class="vbar" style="width:${(group.length / maxGroup) * 100}%">${choiceSegs(group)}</div>${yesNo(group)}</div></div>`;
    const yes = group.filter((seat) => reactions.get(seat.id)?.get("DECISION") === "YES").length;
    const no = group.length - yes;
    const seg = (cls: string, n: number) => (n > 0 ? `<span class="seg ${cls}" style="width:${(n / group.length) * 100}%">${cls.toUpperCase()} ${n}</span>` : "");
    return `<div class="vrow"><div><b>${esc(fit)}</b><br><small>${group.length} seat${group.length === 1 ? "" : "s"}</small></div><div class="vbar">${seg("yes", yes)}${seg("no", no)}</div></div>`;
  }).join("");
  const consensus = outcome.consensus as Rec | undefined;
  const consensusHtml = consensus && (consensus.spread !== undefined || consensus.agreement !== undefined)
    ? `<div class="cons">${consensus.spread !== undefined ? `<span><b>${esc(consensus.spread)}</b> spread</span>` : ""}${consensus.agreement !== undefined ? `<span><b>${esc(consensus.agreement)}</b> agreement</span>` : ""}</div>`
    : "";

  const labels = new Map(((snapshot.scoring?.dimensions ?? []) as Rec[]).map((dim) => [dim.id, dim]));
  const scoreRows = ((outcome.scorecard?.dimensions ?? []) as Rec[]).map((dim) => {
    const meta = labels.get(dim.id);
    return `<div class="srow"><div><b>${esc(meta?.label ?? dim.id)}</b><br><small>weight ${esc(meta?.weight ?? "")}</small></div><div class="track"><i style="width:${Math.max(0, Math.min(100, Number(dim.raw_score)))}%"></i></div><div><b>${esc(dim.raw_score)}</b> raw · <b>${esc(dim.weighted_contribution)}</b> weighted</div></div>`;
  }).join("");

  // REPORT-COPY headline/headings are the synthesis step's answer-first copy; anything but a non-empty string falls back.
  const copyText = (value: unknown, key: string): string => {
    if (value === undefined) return "";
    if (typeof value === "string" && value.trim()) return value;
    console.error(`render-report: warning, REPORT-COPY.json ${key} is not a non-empty string; ignored.`);
    return "";
  };
  // An optional array of strings; a missing, null or empty entry falls back per item.
  const copyList = (key: string): string[] => {
    const value = copy?.[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      console.error(`render-report: warning, REPORT-COPY.json ${key} is not an array; ignored.`);
      return [];
    }
    return value.map((entry, index) => (entry === null || entry === "" ? "" : copyText(entry, `${key}[${index}]`)));
  };
  const dissentTopics = copyList("dissent_topics");
  const nameOf = new Map(seats.map((seat) => [seat.id, seat.name]));
  const dissent = ((outcome.result?.dissent ?? []) as Rec[]).map((cite, index) =>
    `<div class="dq"><span class="code">D${index + 1} · ${dissentTopics[index] ? `${esc(dissentTopics[index])} · ` : ""}${esc(cite.field === "GATE" ? "Overview" : cite.field)}</span><p>${esc(cite.field === "GATE" ? checkLabel(reactions.get(cite.seat_id)?.get("GATE") ?? "") : reactions.get(cite.seat_id)?.get(cite.field) ?? "")}</p><p class="who">${esc(nameOf.get(cite.seat_id) ?? cite.seat_id)}</p></div>`).join("");

  // failed_seats and retried_seats hold { seat_id, reason } records (validate-run failure-record / retry-record).
  const ids = (value: unknown): string[] => (Array.isArray(value) ? value.map((entry) => String((entry as Rec)?.seat_id ?? entry)) : []);
  const failed = ids(run.failed_seats);
  const retried = ids(run.retried_seats);
  const expected = ids(run.expected_seats).length;
  const active = expected - failed.length;
  const answered = seats.filter((seat) => reactions.has(seat.id)).length;
  if (answered !== active) console.error(`render-report: warning, RUN.json says ${active} active seats but the snapshot run has ${answered} reactions`);
  const mode = String(run.execution_mode ?? "");
  const provenance = String(run.execution_provenance ?? "");
  const attestation = run.isolation_attestation as Rec | undefined;
  // Mirrors validate-run's judgment: only runtime-attested isolation is claimed; shared context is never called isolated.
  const isolation = mode === SHARED_CONTEXT_MODE
    ? `Seats ran in one shared context, not isolated: ${String(run.degraded_reason ?? "").trim().replace(/\.$/, "")}.`
    : ISOLATED_MODES.has(mode) && provenance === "operator-recorded"
      ? "Seat isolation is operator-recorded and unverified; the run validator does not prove isolation."
      : ISOLATED_MODES.has(mode) && provenance === "runtime-attested"
        ? `Isolation is runtime-attested${attestation?.provider ? ` by ${String(attestation.provider)}` : ""}.`
        : `Execution mode ${mode || "not recorded"}, provenance ${provenance || "not recorded"}.`;
  const panel = snapshot.panel as Rec;
  const objective = String(panel.objective ?? "");
  const copyHeadline = copyText(copy?.headline, "headline");
  // With a copy headline the objective leaves the hero and opens the method list, so it is still shown.
  const runLines = [
    ...(copyHeadline && objective.trim() ? [`The ask: ${objective.trim()}`] : []),
    `${active} active seats of ${expected} expected.`,
    ...(failed.length ? [`Failed seats: ${failed.join(", ")}.`] : []),
    ...(retried.length ? [`Retried seats: ${retried.join(", ")}.`] : []),
    `Execution mode ${String(run.execution_mode ?? "")}, runtime ${String(run.runtime ?? "")}, model ${String(run.model ?? "")}.`,
    isolation,
    `Run window: ${String(run.created_at ?? "")} – ${String(run.completed_at ?? "")}.`,
  ].map((line) => `<li>${esc(line)}</li>`).join("");

  const rawHeadings = copy?.headings;
  if (rawHeadings !== undefined && (typeof rawHeadings !== "object" || rawHeadings === null || Array.isArray(rawHeadings))) console.error(`render-report: warning, REPORT-COPY.json headings is not an object; ignored.`);
  const headingCopy = rawHeadings && typeof rawHeadings === "object" && !Array.isArray(rawHeadings) ? (rawHeadings as Rec) : {};
  const heading = (key: string, fallback: string): string => esc(copyText(headingCopy[key], `headings.${key}`) || fallback);

  // One row per seat that answered; "What stops it" is REPORT-COPY seats.<id>.stops, else the seat's own first RESISTS sentence.
  const answeredSeats = seats.filter((seat) => reactions.has(seat.id));
  const seatRows = answeredSeats.map((seat) => {
    const fields = reactions.get(seat.id)!;
    const specialist = seat.kind === "specialist";
    const intensity = fields.get("INTENSITY") ?? "";
    const stops = copyText(copy?.seats?.[seat.id]?.stops, `seats.${seat.id}.stops`) || firstSentence(fields.get("RESISTS") ?? "");
    return `<tr><td>${esc(seat.id)}</td><td>${esc(seat.fit)}</td>${versionVote ? `<td>${esc(choiceOf.get(seat.id) === "NEITHER" ? "Neither" : choiceOf.get(seat.id) ?? "")}</td>` : ""}<td>${esc(specialist ? checkLabel(fields.get("GATE") ?? "") : fields.get("DECISION") ?? "")}</td><td>${esc(intensity === "NOT-APPLICABLE" ? "n/a" : intensity)}</td><td>${esc(stops)}</td></tr>`;
  }).join("\n");
  const seatTable = `<details><summary>Seat-by-seat table</summary><table class="t"><thead><tr><th>Seat</th><th>Fit</th>${versionVote ? "<th>Version</th>" : ""}<th>Decision</th><th>Intensity</th><th>What stops it</th></tr></thead><tbody>\n${seatRows}\n</tbody></table></details>`;

  // Hero tiles: REPORT-COPY tiles verbatim, else four counts computed from the reactions, RUN.json and the specialist GATE.
  const rawTiles = copy?.tiles;
  const tilesOk = Array.isArray(rawTiles) && rawTiles.length > 0 && rawTiles.length <= 4
    && rawTiles.every((tile) => typeof tile?.value === "string" && tile.value.trim() && typeof tile?.label === "string" && tile.label.trim());
  if (rawTiles !== undefined && !tilesOk) console.error(`render-report: warning, REPORT-COPY.json tiles is not 1-4 { value, label } strings; ignored.`);
  const buyers = answeredSeats.filter((seat) => seat.kind !== "specialist");
  const countOf = (group: typeof seats, decision: string): number => group.filter((seat) => reactions.get(seat.id)?.get("DECISION") === decision).length;
  // Core denominator is every active core buyer seat in the snapshot, failed or silent ones included.
  const core = seats.filter((seat) => seat.kind !== "specialist" && seat.fit === "core");
  // Seat-count wording claims no more than validate-run judges: unverified isolation says so.
  const seatLabel = ISOLATED_MODES.has(mode) && provenance === "runtime-attested" ? "seats read alone"
    : ISOLATED_MODES.has(mode) && provenance === "operator-recorded" ? "seats read alone (unverified)"
      : mode === SHARED_CONTEXT_MODE ? "seats, shared context" : "seats";
  const gated = answeredSeats.filter((seat) => seat.kind === "specialist" && reactions.get(seat.id)?.get("GATE")?.trim());
  const tiles: Array<{ value: string; label: string }> = tilesOk
    ? (rawTiles as Array<{ value: string; label: string }>)
    : [
      { value: `${countOf(core, "YES")} of ${core.length}`, label: "core buyers YES" },
      { value: `${countOf(buyers, "YES")} to ${countOf(buyers, "NO")}`, label: "YES vs NO, all buyer seats" },
      { value: String(active), label: seatLabel },
      ...gated.map((seat) => ({ value: checkLabel(reactions.get(seat.id)!.get("GATE")!).slice("Overview: ".length), label: `${seat.name} overview` })),
    ].slice(0, 4);
  const tilesHtml = `<div class="stats">${tiles.map((tile) => `<div class="stat"><b>${esc(tile.value)}</b><span>${esc(tile.label)}</span></div>`).join("")}</div>`;

  const synthesisMd = await readFile(join(runDir, "SYNTHESIS.md"), "utf8").catch(() => "");
  const changes = section(synthesisMd, /smallest useful changes/i);
  // Each numbered change is one card, its text unchanged; any other non-blank line keeps the whole section as prose so no text is dropped.
  const changeItems: string[] = [];
  let cardable = true;
  for (const line of changes.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = line.match(/^\d+\. +(.*)$/);
    if (item) changeItems.push(item[1].trim());
    else if (changeItems.length && /^\s+\S/.test(line)) changeItems[changeItems.length - 1] += ` ${line.trim()}`;
    else cardable = false;
  }
  const changeTitles = copyList("change_titles");
  // Each button only copies a plain-text prompt for the buyer's own agent; the report stays a static file.
  const runId = String(run.run_id ?? basename(runDir));
  const changeLine = (index: number): string => `${index + 1}. ${changeTitles[index] ? `${changeTitles[index]}: ` : ""}${changeItems[index]}`;
  const fixPrompt = (apply: string): string => `Use the synthetic-customer-panel skill to rewrite and retest. Room: ${String(run.panel_id ?? panel.id)}. Run: ${runId}. ${apply}${apply.endsWith("\n") ? "" : " "}Make one variant (not three), prepare a fresh run with the same panel snapshot, scoring and execution mode, render the report, and compare it with run ${runId}.`;
  const fixButton = (label: string, prompt: string): string => `<button class="fixbtn" type="button" data-prompt="${esc(prompt)}">${label}</button>`;
  const allPrompt = fixPrompt(`Apply only these changes, in this order, to the artifact, and keep everything else unchanged:\n${changeItems.map((_, index) => changeLine(index)).join("\n")}\n`);
  const changesBody = cardable && changeItems.length
    ? `<p class="fixall">${fixButton("Apply all fixes", allPrompt)}</p><div class="fixes">${changeItems.map((text, index) => `<div class="fix"><span class="k">${index + 1}</span>${changeTitles[index] ? `<h3>${esc(changeTitles[index])}</h3>` : ""}<p>${inline(text)}</p>${fixButton("Apply this fix", fixPrompt(`Apply only this change to the artifact, and keep everything else unchanged: ${changeLine(index)}${/[.!?]$/.test(changeItems[index]) ? "" : "."}`))}</div>`).join("")}</div>`
    : `<div class="panel changes">${prose(changes)}</div>`;
  const changesHtml = changes
    ? `<section id="changes"><p class="eyebrow">What it still needs</p><h2 class="sec">${heading("changes", "The smallest useful changes")}</h2><hr class="rule">${changesBody}</section>`
    : "";
  let artifactSection = "";
  try {
    // validate-run already refuses an escaping artifact_file; this read is fenced to the run dir as well.
    const artifactPath = await resolveReadWithin(await canonicalDirectory(runDir, "run folder"), String(run.artifact_file ?? ""));
    artifactSection = `<section id="artifact"><p class="eyebrow">The artifact</p><h2 class="sec">${heading("artifact", "What the panel read")}</h2><hr class="rule">${artifactColumns(await readFile(artifactPath, "utf8"), String(run.artifact_label ?? run.artifact_file))}</section>`;
  } catch (error) {
    console.error(`render-report: warning, artifact not shown: ${error instanceof Error ? error.message : String(error)}`);
  }

  const question = copyText(copy?.question, "question");
  const summary = copyText(copy?.summary, "summary");
  const headline = copyHeadline || firstSentence(objective);
  // With a copy headline the objective moved to the method list; without one the hero keeps the rest of it.
  const rest = copyHeadline ? "" : objective.trim().slice(headline.length).trim();
  // headline_em wraps its first occurrence in the headline in gold; a non-substring is ignored with one warning.
  const em = copyText(copy?.headline_em, "headline_em");
  const at = em ? headline.indexOf(em) : -1;
  if (em && at < 0) console.error(`render-report: warning, REPORT-COPY.json headline_em is not a substring of the headline; ignored.`);
  const h1 = at < 0 ? esc(headline) : `${esc(headline.slice(0, at))}<em>${esc(em)}</em>${esc(headline.slice(at + em.length))}`;
  const brand = copyText(copy?.brand, "brand");
  const footerBrand = copyText(copy?.footer_brand, "footer_brand");
  const voteNote = copyText(copy?.vote_note, "vote_note");
  // A leading "Label:" in the note is bolded as v2 does; the text itself is unchanged.
  const noteHtml = voteNote ? `<div class="gatenote">${esc(voteNote).replace(/^([A-Za-z][A-Za-z -]{0,39}):/, "<b>$1:</b>")}</div>` : "";
  const tabs = [["room", "Panel"], ["vote", "Vote"], ["score", "Score"], ...(changesHtml ? [["changes", "Changes"]] : []), ["dissent", "Dissent"], ...(artifactSection ? [["artifact", "Artifact"]] : []), ["method", "Method"], ["limitations", "Limits"], ["next", "Next"]];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(panel.name)} panel report</title><style>${CSS}</style></head><body>
<script>function openAll(){document.querySelectorAll("details").forEach((d)=>{d.open=true})}addEventListener("beforeprint",openAll)</script>
<header class="hero" style="background-image:url('${await dataUri(heroPath)}')">${brand ? `<div class="brand">${esc(brand)}</div>` : ""}<button class="dl" type="button" onclick="openAll();window.print()">Download PDF</button><div class="wrap">
<p class="q">${esc(question || panel.name)}</p><h1>${h1}</h1>${rest ? `<p class="more">${esc(rest)}</p>` : ""}
<div class="verdict"><span class="pill">${esc(outcome.result?.decision)} <b>${esc(outcome.scorecard?.total)}</b></span></div>
${summary ? `<p class="why">${esc(summary)}</p>` : ""}${tilesHtml}
</div></header>
<nav class="tabs"><div class="wrap">${tabs.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}</div></nav>
<main class="wrap">
<section id="room"><p class="eyebrow">The panel</p><h2 class="sec">${heading("room", "Meet the room")}</h2><hr class="rule"><div class="grid">
${[...gateCards, ...cards].join("\n")}
</div><p class="caption">Illustrative composites, not real people.</p></section>
<section id="vote"><p class="eyebrow">The vote</p><h2 class="sec">${heading("vote", versionVote ? "Version choice by fit" : "YES and NO by fit")}</h2><hr class="rule"><div class="panel">${versionHead}${voteRows}${legend}${noteHtml}${consensusHtml}${seatTable}</div></section>
<section id="score"><p class="eyebrow">The score</p><h2 class="sec">${heading("score", "Scorecard")}</h2><hr class="rule"><div class="panel"><p class="total">${esc(outcome.scorecard?.total)}<small> / 100</small></p>${scoreRows}</div></section>
${changesHtml}
<section id="dissent"><p class="eyebrow">What could go wrong</p><h2 class="sec">${heading("dissent", "Dissent")}</h2><hr class="rule"><div class="dissent">${dissent}</div></section>
${artifactSection}
<section id="method"><p class="eyebrow">How this was run</p><h2 class="sec">${heading("method", `One ask, ${active} readers, one verdict`)}</h2><hr class="rule"><div class="panel"><ol class="runlines">${runLines}</ol></div></section>
<section id="limitations"><div class="panel"><h2 class="sec">Limitations</h2>${prose(section(resultMd, "Limitations"))}</div></section>
</main><footer class="band" id="next"><div class="wrap"><p class="eyebrow">Next experiment</p><hr class="rule"><h2>${heading("next", "Next experiment")}</h2>${prose(section(resultMd, "Next experiment"))}
<p class="small">Run ${esc(run.run_id ?? basename(runDir))} · room ${esc(run.panel_id ?? panel.id)} · confidence ${esc(outcome.result?.confidence)}${footerBrand ? ` · ${esc(footerBrand)}` : ""}</p><p class="small">Synthetic panel: directional, not a prediction of real behaviour.</p></div></footer>
<script>(()=>{const links=[...document.querySelectorAll("nav.tabs a")];const mark=(a)=>links.forEach((l)=>l.classList.toggle("on",l===a));let pinned=false,pinTimer;const unpin=()=>{pinned=false;clearTimeout(pinTimer)};links.forEach((a)=>a.addEventListener("click",()=>{pinned=true;mark(a);clearTimeout(pinTimer);pinTimer=setTimeout(unpin,1000)}));["wheel","touchstart","keydown"].forEach((t)=>addEventListener(t,unpin,{passive:true}));["pointerdown","mousedown"].forEach((t)=>addEventListener(t,(e)=>{if(!(e.target instanceof Element&&e.target.closest("nav.tabs a")))unpin()},{passive:true}));if(!("IntersectionObserver" in window))return;const seen=new Set();const pick=()=>{if(pinned)return;if(innerHeight+scrollY>=document.documentElement.scrollHeight-2)return mark(links[links.length-1]);let top;for(const s of seen)if(!top||s.getBoundingClientRect().top<top.getBoundingClientRect().top)top=s;if(top)mark(links.find((a)=>a.hash==="#"+top.id))};const io=new IntersectionObserver((entries)=>{for(const e of entries)e.isIntersecting?seen.add(e.target):seen.delete(e.target);pick()},{rootMargin:"-49px 0px -60% 0px"});links.forEach((a)=>{const s=document.getElementById(a.hash.slice(1));if(s)io.observe(s)});addEventListener("scroll",pick,{passive:true})})()</script>
<script>(()=>{const done="Copied. Paste it into the AI agent that runs this panel.";const toast=()=>{const t=document.createElement("div");t.className="toast";t.setAttribute("role","status");t.textContent=done;document.body.append(t);setTimeout(()=>t.remove(),3000)};const legacy=(p)=>{const ta=document.createElement("textarea");ta.value=p;ta.readOnly=true;ta.style.cssText="position:fixed;left:-9999px;top:0";document.body.append(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch{}ta.remove();return ok};const byHand=(p)=>{const d=document.createElement("dialog");d.className="promptbox";const ta=document.createElement("textarea");ta.value=p;ta.readOnly=true;const close=document.createElement("button");close.type="button";close.className="fixbtn";close.textContent="Close";close.onclick=()=>d.remove();d.append(ta,close);document.body.append(d);if(d.showModal)d.showModal();else d.setAttribute("open","");ta.focus();ta.select()};const fallback=(p)=>legacy(p)?toast():byHand(p);document.querySelectorAll("button.fixbtn[data-prompt]").forEach((b)=>b.addEventListener("click",()=>{const p=b.dataset.prompt;if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(p).then(toast,()=>fallback(p));else fallback(p)}))})()</script>
</body></html>
`;
  await writeFile(out, html);
  console.log(`rendered: ${out}`);
}

main().catch((error: unknown) => {
  console.error(`render-report failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
