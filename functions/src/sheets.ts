import { google, type sheets_v4 } from "googleapis";
import {
  LIFTING_HEADERS, SESSION_HEADERS, SWIMMING_HEADERS, WEIGHT_HEADERS, type Cell,
} from "./rows";

export type Sheets = sheets_v4.Sheets;

export const RAW_TABS = {
  Sessions: SESSION_HEADERS,
  Lifting: LIFTING_HEADERS,
  Swimming: SWIMMING_HEADERS,
  "Body weight": WEIGHT_HEADERS,
} as const;
export type RawTab = keyof typeof RAW_TABS;

const DAILY_HEADERS = [
  "Date", "Body weight", "Sessions", "Duration (min)", "Net kcal", "Eat-back kcal", "Sets", "Laps",
  "Lift volume", "Avg mood", "Avg effort",
];
const WEEKLY_HEADERS = [
  "Week start (Mon)", "Active days", "Sessions", "Kcal arms", "Kcal upper", "Kcal legs", "Kcal swim",
  "Net kcal", "Avg effort",
];
const WEEKLY_ROWS = 520; // ten years of weeks

export function getSheets(): Sheets {
  const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}

const q = (tab: string) => `'${tab}'`;

async function tabIds(sheets: Sheets, id: string): Promise<Map<string, number>> {
  const res = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties(sheetId,title)" });
  return new Map((res.data.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]));
}

function summaryValues(tab: "Daily" | "Weekly"): Cell[][] {
  if (tab === "Daily") {
    const S = "Sessions!";
    const crit = `${S}$B$2:$B,A2:A`;
    const wrap = (f: string) => `=ARRAYFORMULA(IF(A2:A="","",${f}))`;
    return [
      DAILY_HEADERS,
      [
        `=IFERROR(SORT(UNIQUE(FILTER(${S}B2:B,${S}B2:B<>""))))`,
        wrap(`IFERROR(VLOOKUP(A2:A,'Body weight'!A2:B,2,FALSE),"")`),
        wrap(`COUNTIFS(${crit})`),
        wrap(`SUMIFS(${S}$F$2:$F,${crit})`),
        wrap(`SUMIFS(${S}$O$2:$O,${crit})`),
        wrap(`E2:E*$M$1/100`),
        wrap(`SUMIFS(${S}$L$2:$L,${crit})`),
        wrap(`SUMIFS(${S}$M$2:$M,${crit})`),
        wrap(`SUMIFS(${S}$N$2:$N,${crit})`),
        wrap(`IFERROR(AVERAGEIFS(${S}$I$2:$I,${crit}),"")`),
        wrap(`IFERROR(AVERAGEIFS(${S}$J$2:$J,${crit}),"")`),
      ],
    ];
  }
  const B = "Sessions!$B$2:$B";
  const win = (r: number) => `${B},">="&$A${r},${B},"<"&$A${r}+7`;
  const rows: Cell[][] = [WEEKLY_HEADERS];
  for (let r = 2; r < 2 + WEEKLY_ROWS; r++) {
    const sum = (col: string) => `=IF($A${r}="","",SUMIFS(Sessions!$${col}$2:$${col},${win(r)}))`;
    rows.push([
      r === 2
        ? `=IFERROR(SORT(UNIQUE(FILTER(ARRAYFORMULA(${B}-WEEKDAY(${B},3)),${B}<>""))))`
        : null,
      `=IF($A${r}="","",IFERROR(COUNTUNIQUE(FILTER(${B},${B}>=$A${r},${B}<$A${r}+7)),0))`,
      `=IF($A${r}="","",COUNTIFS(${win(r)}))`,
      sum("Q"), sum("R"), sum("S"), sum("T"), sum("O"),
      `=IF($A${r}="","",IFERROR(AVERAGEIFS(Sessions!$J$2:$J,${win(r)}),""))`,
    ]);
  }
  return rows;
}

async function writeSummary(sheets: Sheets, id: string, tab: "Daily" | "Weekly", eatBackPct: number) {
  const values = summaryValues(tab);
  await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `${q(tab)}!A:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${q(tab)}!A1`, valueInputOption: "USER_ENTERED", requestBody: { values },
  });
  if (tab === "Daily") await setEatBack(sheets, id, eatBackPct);
}

export async function setEatBack(sheets: Sheets, id: string, pct: number) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${q("Daily")}!L1:M1`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [["Eat-back %", pct]] },
  });
}

/** Creates any missing tabs with headers (raw) or formulas (summary). Returns tab → sheetId. */
export async function ensureTabs(sheets: Sheets, id: string, eatBackPct: number): Promise<Map<string, number>> {
  let ids = await tabIds(sheets, id);
  const wanted = [...Object.keys(RAW_TABS), "Daily", "Weekly"];
  const missing = wanted.filter((t) => !ids.has(t));
  if (missing.length === 0) return ids;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: missing.map((title) => ({
        addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } },
      })),
    },
  });
  ids = await tabIds(sheets, id);

  for (const t of missing) {
    if (t in RAW_TABS) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${q(t)}!A1`, valueInputOption: "RAW",
        requestBody: { values: [[...RAW_TABS[t as RawTab]]] },
      });
    } else {
      await writeSummary(sheets, id, t as "Daily" | "Weekly", eatBackPct);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: [{
            repeatCell: {
              range: { sheetId: ids.get(t)!, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
              fields: "userEnteredFormat.numberFormat",
            },
          }],
        },
      });
    }
  }
  return ids;
}

/** Deletes every row of `tab` whose first column equals `key`. */
export async function deleteRowsByKey(sheets: Sheets, id: string, tab: string, sheetId: number, key: string) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${q(tab)}!A2:A` });
  const col = res.data.values ?? [];
  const idx: number[] = [];
  col.forEach((r, i) => {
    if (String(r[0] ?? "") === key) idx.push(i + 1); // 0-based sheet row index
  });
  if (idx.length === 0) return;

  // Collapse into contiguous ranges and delete bottom-up so indices stay valid.
  const ranges: [number, number][] = [];
  for (const i of idx) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else ranges.push([i, i + 1]);
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: ranges.reverse().map(([startIndex, endIndex]) => ({
        deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex, endIndex } },
      })),
    },
  });
}

export async function appendRows(sheets: Sheets, id: string, tab: string, rows: Cell[][]) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${q(tab)}!A1`, valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS", requestBody: { values: rows },
  });
}

/** Replaces the Body weight row for `date`, keeping rows sorted by date. */
export async function replaceWeightRow(
  sheets: Sheets, id: string, sheetId: number, date: string, row: Cell[] | null,
) {
  await deleteRowsByKey(sheets, id, "Body weight", sheetId, date);
  if (!row) return;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${q("Body weight")}!A2:A`, valueRenderOption: "FORMATTED_VALUE",
  });
  const dates = (res.data.values ?? []).map((r) => String(r[0] ?? ""));
  let at = dates.findIndex((d) => d > date);
  if (at === -1) at = dates.length;
  const rowIndex = at + 1;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
          inheritFromBefore: rowIndex > 1,
        },
      }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${q("Body weight")}!A${rowIndex + 1}`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

/** Clears raw tabs (keeping headers), writes everything, recreates summary tabs. */
export async function rebuildAll(
  sheets: Sheets, id: string, eatBackPct: number,
  data: { sessions: Cell[][]; lifting: Cell[][]; swimming: Cell[][]; weights: Cell[][] },
): Promise<number> {
  await ensureTabs(sheets, id, eatBackPct);
  const plan: [RawTab, Cell[][]][] = [
    ["Sessions", data.sessions], ["Lifting", data.lifting], ["Swimming", data.swimming], ["Body weight", data.weights],
  ];
  let total = 0;
  for (const [tab, rows] of plan) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `${q(tab)}!A2:Z` });
    if (rows.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${q(tab)}!A2`, valueInputOption: "USER_ENTERED", requestBody: { values: rows },
      });
    }
    total += rows.length;
  }
  await writeSummary(sheets, id, "Daily", eatBackPct);
  await writeSummary(sheets, id, "Weekly", eatBackPct);
  return total;
}
