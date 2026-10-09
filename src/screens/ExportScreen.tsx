import { useState } from "react";
import { getDocs, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "../auth";
import { localDateString } from "../calc/dates";
import { sessionsCol, weightsCol } from "../data/refs";
import { useSettings } from "../data/hooks";
import type { Session } from "../data/types";
import { downloadBlob, toCsv } from "../export/download";
import {
  LIFTING_HEADERS, SESSION_HEADERS, SWIMMING_HEADERS, WEIGHT_HEADERS, liftingRows, sessionRow, swimmingRows,
  weightRow, type Cell,
} from "../export/rows";
import { DAILY_HEADERS, WEEKLY_HEADERS, dailyRows, weeklyRows } from "../export/summary";

type RangeKey = "week" | "month" | "30" | "all" | "custom";

function resolveRange(key: RangeKey, from: string, to: string): [string, string] {
  const now = new Date();
  const today = localDateString(now);
  switch (key) {
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return [localDateString(d), today];
    }
    case "month":
      return [localDateString(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    case "30":
      return [localDateString(new Date(now.getTime() - 29 * 86_400_000)), today];
    case "all":
      return ["0000-01-01", "9999-12-31"];
    default:
      return [from, to];
  }
}

export function ExportScreen() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [key, setKey] = useState<RangeKey>("month");
  const [from, setFrom] = useState(localDateString(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(localDateString(new Date()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!user) return null;

  const load = async () => {
    const [f, t] = resolveRange(key, from, to);
    const [s, w] = await Promise.all([
      getDocs(query(sessionsCol(user.uid), where("date", ">=", f), where("date", "<=", t), orderBy("date"))),
      getDocs(query(weightsCol(user.uid), where("date", ">=", f), where("date", "<=", t), orderBy("date"))),
    ]);
    const sessions = s.docs
      .map((d) => ({ id: d.id, ...(d.data() as Session) }))
      .filter((x) => x.status === "finished");
    const weights = w.docs.map((d) => d.data() as { date: string; weight: number; unit: "lb" | "kg" });
    const names = [f === "0000-01-01" ? (sessions[0]?.date ?? localDateString(new Date())) : f,
                   t === "9999-12-31" ? localDateString(new Date()) : t];
    return { sessions, weights, name: `gym-log_${names[0]}_${names[1]}` };
  };

  const tables = (sessions: (Session & { id: string })[], weights: { date: string; weight: number; unit: "lb" | "kg" }[]) => ({
    Sessions: { headers: SESSION_HEADERS, rows: sessions.map((s) => sessionRow(s.id, s)) },
    Lifting: { headers: LIFTING_HEADERS, rows: sessions.flatMap((s) => liftingRows(s.id, s)) },
    Swimming: { headers: SWIMMING_HEADERS, rows: sessions.flatMap((s) => swimmingRows(s.id, s)) },
    "Body weight": { headers: WEIGHT_HEADERS, rows: weights.map(weightRow) },
    Daily: { headers: DAILY_HEADERS, rows: dailyRows(sessions, weights, settings.eatBackPct) },
    Weekly: { headers: WEEKLY_HEADERS, rows: weeklyRows(sessions) },
  });

  const run = async (kind: "xlsx" | "csv") => {
    setBusy(true);
    setMessage(null);
    try {
      const { sessions, weights, name } = await load();
      if (sessions.length === 0 && weights.length === 0) {
        setMessage("Nothing to export in that range.");
        return;
      }
      const t = tables(sessions, weights);
      if (kind === "xlsx") {
        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();
        for (const [sheet, { headers, rows }] of Object.entries(t)) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...(rows as Cell[][])]), sheet);
        }
        const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        downloadBlob(`${name}.xlsx`, out, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        downloadBlob(`${name}_lifting.csv`, toCsv(t.Lifting.headers, t.Lifting.rows), "text/csv");
        downloadBlob(`${name}_sessions.csv`, toCsv(t.Sessions.headers, t.Sessions.rows), "text/csv");
      }
      setMessage(`Exported ${sessions.length} session${sessions.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const RANGES: [RangeKey, string][] = [
    ["week", "This week"], ["month", "This month"], ["30", "Last 30 days"], ["all", "All time"], ["custom", "Custom"],
  ];

  return (
    <div className="stack">
      <h1>Export</h1>
      <div className="chips" role="radiogroup" aria-label="Date range">
        {RANGES.map(([k, label]) => (
          <button key={k} role="radio" aria-checked={key === k} className={`chip${key === k ? " on" : ""}`} onClick={() => setKey(k)}>
            {label}
          </button>
        ))}
      </div>
      {key === "custom" && (
        <div className="row">
          <div className="field grow">
            <label className="field-label" htmlFor="x-from">From</label>
            <input id="x-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field grow">
            <label className="field-label" htmlFor="x-to">To</label>
            <input id="x-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      )}
      <button className="btn primary block" disabled={busy} onClick={() => void run("xlsx")}>Download Excel (.xlsx)</button>
      <button className="btn block" disabled={busy} onClick={() => void run("csv")}>Download CSV (lifting + sessions)</button>
      {message && <p className="muted" role="status">{message}</p>}
      <p className="muted small">
        The workbook has Sessions, Lifting, Swimming, Body weight, Daily and Weekly tabs. Only finished sessions are exported.
      </p>
    </div>
  );
}
