import { Link } from "react-router-dom";
import type { Group, Session, Settings } from "../data/types";
import { GROUPS, fmtDay, fmtDuration, fmtKcal, fmtTime, groupColor, shownKcal } from "../ui/format";

export function groupsIn(s: Session): Group[] {
  const present = new Set(s.entries.map((e) => e.group));
  return GROUPS.filter((g) => present.has(g));
}

export function SessionRow({ id, session, settings }: { id: string; session: Session; settings: Settings }) {
  const k = shownKcal(settings, session.totals.kcalGross, session.totals.kcalNet);
  return (
    <Link to={`/session/${id}`} className="entry link-row">
      <div className="entry-main">
        <div className="entry-title">
          {fmtDay(session.date)}
          {session.status === "active" && <span className="badge live">In progress</span>}
        </div>
        <div className="muted small">
          {session.locationName ?? "No location"} · {fmtTime(session.startedAt.toDate())}
          {session.durationMin != null && ` · ${fmtDuration(session.durationMin)}`}
        </div>
      </div>
      <div className="entry-side">
        <span className="bars" aria-hidden="true">
          {groupsIn(session).map((g) => <i key={g} style={{ background: groupColor(g) }} />)}
        </span>
        <span className="kcal">{fmtKcal(k)}<span className="muted small"> kcal</span></span>
      </div>
    </Link>
  );
}
