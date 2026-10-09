import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { localDateString } from "../calc/dates";
import { LogWeightSheet } from "../components/LogWeightSheet";
import { SessionRow } from "../components/SessionRow";
import { SessionView } from "../components/SessionView";
import { StartSessionSheet } from "../components/StartSessionSheet";
import { useActiveSession, useSessions, useSettings, useWeights } from "../data/hooks";
import { fmtKcal, num1 } from "../ui/format";

export function SessionScreen() {
  const { data: settings } = useSettings();
  const active = useActiveSession();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<null | "start" | "past" | "weight">(null);

  const today = localDateString(new Date());
  const weekAgo = localDateString(new Date(Date.now() - 6 * 86_400_000));
  const { data: recent } = useSessions(weekAgo, today);
  const { data: weights } = useWeights(today, today);

  if (active.loading) return <p className="muted">Loading…</p>;
  if (active.data) {
    return <SessionView id={active.data.id} session={active.data} active />;
  }

  const finished = recent.filter((s) => s.status === "finished").sort((a, b) => b.startedAt.toMillis() - a.startedAt.toMillis());
  const todays = finished.filter((s) => s.date === today);
  const net = todays.reduce((n, s) => n + s.totals.kcalNet, 0);
  const todayWeight = weights[0];

  return (
    <div className="stack">
      <h1>Log It!</h1>
      <div className="stack">
        <button className="btn primary block big" onClick={() => setSheet("start")}>Start session</button>
        <button className="btn block" onClick={() => setSheet("past")}>Log past session</button>
      </div>

      <section className="card">
        <h2 className="tight">Today</h2>
        {todays.length === 0 ? (
          <p className="muted">No finished sessions yet.</p>
        ) : (
          <dl className="summary">
            <div><dt>Sessions</dt><dd>{todays.length}</dd></div>
            <div><dt>Net kcal</dt><dd>{fmtKcal(net)}</dd></div>
            <div><dt>Eat back ({settings.eatBackPct}%)</dt><dd>{fmtKcal((net * settings.eatBackPct) / 100)}</dd></div>
          </dl>
        )}
        <div className="row between top-gap">
          <span>
            Weight:{" "}
            {todayWeight ? <strong>{num1(todayWeight.weight)} {todayWeight.unit}</strong> : <span className="muted">not logged</span>}
          </span>
          <button className="btn" onClick={() => setSheet("weight")}>{todayWeight ? "Edit" : "Log weight"}</button>
        </div>
      </section>

      <section>
        <h2>Last 7 days</h2>
        {finished.length === 0 ? (
          <p className="muted">Nothing logged this week.</p>
        ) : (
          <ul className="entries">
            {finished.map((s) => <li key={s.id}><SessionRow id={s.id} session={s} settings={settings} /></li>)}
          </ul>
        )}
      </section>

      {sheet === "start" && <StartSessionSheet onClose={() => setSheet(null)} />}
      {sheet === "past" && (
        <StartSessionSheet past onClose={() => setSheet(null)} onCreated={(id) => navigate(`/session/${id}`)} />
      )}
      {sheet === "weight" && <LogWeightSheet onClose={() => setSheet(null)} />}
    </div>
  );
}
