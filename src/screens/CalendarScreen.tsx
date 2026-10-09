import { useMemo, useState } from "react";
import { convertWeight } from "../calc/weight";
import { localDateString } from "../calc/dates";
import { LogWeightSheet } from "../components/LogWeightSheet";
import { SessionRow, groupsIn } from "../components/SessionRow";
import { useSessions, useSettings, useWeights } from "../data/hooks";
import { GROUPS, fmtDay, fmtKcal, groupColor, num1 } from "../ui/format";
import { GROUP_LABEL } from "../data/defaults";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarScreen() {
  const { data: settings } = useSettings();
  const todayStr = localDateString(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(todayStr);
  const [weightSheet, setWeightSheet] = useState(false);

  const first = localDateString(month);
  const last = localDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const { data: sessions } = useSessions(first, last);
  const { data: weights } = useWeights(first, last);

  const byDate = useMemo(() => {
    const m = new Map<string, typeof sessions>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);
  const weightByDate = useMemo(() => new Map(weights.map((w) => [w.date, w])), [weights]);

  const lead = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => localDateString(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];

  const finished = sessions.filter((s) => s.status === "finished");
  const activeDays = new Set(finished.map((s) => s.date)).size;
  const net = finished.reduce((n, s) => n + s.totals.kcalNet, 0);
  const wFirst = weights[0];
  const wLast = weights[weights.length - 1];
  const wChange =
    wFirst && wLast && wFirst.date !== wLast.date
      ? convertWeight(wLast.weight, wLast.unit, settings.bodyUnit) - convertWeight(wFirst.weight, wFirst.unit, settings.bodyUnit)
      : null;

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const daySessions = (byDate.get(selected) ?? []).sort((a, b) => a.startedAt.toMillis() - b.startedAt.toMillis());
  const dayWeight = weightByDate.get(selected);

  return (
    <div className="stack">
      <div className="row between">
        <button className="btn sq" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <h1 className="tight">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</h1>
        <button className="btn sq" aria-label="Next month" onClick={() => shift(1)}>›</button>
      </div>

      <div className="legend">
        {GROUPS.map((g) => (
          <span key={g}><i style={{ background: groupColor(g) }} /> {GROUP_LABEL[g]}</span>
        ))}
      </div>

      <div className="cal" role="grid" aria-label="Calendar">
        {DOW.map((d, i) => <div key={i} className="cal-dow" role="columnheader">{d}</div>)}
        {cells.map((date, i) =>
          date == null ? <div key={`b${i}`} /> : (
            <button
              key={date}
              role="gridcell"
              className={`cal-day${date === selected ? " sel" : ""}${date === todayStr ? " today" : ""}`}
              onClick={() => setSelected(date)}
              aria-label={fmtDay(date)}
            >
              <span>{Number(date.slice(8))}</span>
              {weightByDate.has(date) && <b className="wdot" title="Weigh-in" />}
              <span className="cal-bars">
                {GROUPS.filter((g) => (byDate.get(date) ?? []).some((s) => groupsIn(s).includes(g))).map((g) => (
                  <i key={g} style={{ background: groupColor(g) }} />
                ))}
              </span>
            </button>
          ),
        )}
      </div>

      <dl className="summary">
        <div><dt>Active days</dt><dd>{activeDays}</dd></div>
        <div><dt>Sessions</dt><dd>{finished.length}</dd></div>
        <div><dt>Net kcal</dt><dd>{fmtKcal(net)}</dd></div>
        <div>
          <dt>Weight change</dt>
          <dd>{wChange == null ? "–" : `${wChange >= 0 ? "+" : ""}${num1(wChange)} ${settings.bodyUnit}`}</dd>
        </div>
      </dl>

      <section className="card stack">
        <h2 className="tight">{fmtDay(selected)}</h2>
        <div className="row between">
          <span>
            Weight:{" "}
            {dayWeight ? <strong>{num1(dayWeight.weight)} {dayWeight.unit}</strong> : <span className="muted">not logged</span>}
          </span>
          <button className="btn" onClick={() => setWeightSheet(true)}>{dayWeight ? "Edit" : "Log"}</button>
        </div>
        {daySessions.length === 0 ? (
          <p className="muted">No sessions.</p>
        ) : (
          <ul className="entries">
            {daySessions.map((s) => <li key={s.id}><SessionRow id={s.id} session={s} settings={settings} /></li>)}
          </ul>
        )}
      </section>

      {weightSheet && <LogWeightSheet date={selected} onClose={() => setWeightSheet(false)} />}
    </div>
  );
}
