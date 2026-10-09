import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "../auth";
import { formatSets } from "../calc/weight";
import { totalLaps, swimDistance } from "../calc/calories";
import { useSettings } from "../data/hooks";
import { deleteSession, finishSession, updateSession } from "../data/mutations";
import type { Entry, Rating, Session } from "../data/types";
import { useLatest, useNow, useVisibilityTick } from "../ui/hooks";
import {
  EQUIPMENT_LABEL, STROKE_LABEL, fmtDuration, fmtElapsed, fmtKcal, fmtTime, fromInputValue, groupColor, num1,
  shownKcal, toInputValue,
} from "../ui/format";
import { ConfirmButton } from "./ConfirmButton";
import { FinishSheet } from "./FinishSheet";
import { LiftSheet } from "./LiftSheet";
import { LocationPicker } from "./LocationPicker";
import { RatingRow } from "./RatingRow";
import { SwimSheet } from "./SwimSheet";
import { STROKES } from "../calc/calories";

type Open =
  | null
  | { type: "lift"; entry?: Extract<Entry, { kind: "lift" }> }
  | { type: "swim"; entry?: Extract<Entry, { kind: "swim" }> }
  | { type: "finish"; end?: Date };

export function SessionView({ id, session, active }: { id: string; session: Session; active: boolean }) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Open>(null);
  const now = useNow(active ? 1000 : 60_000);
  useVisibilityTick();

  if (!user) return null;
  const uid = user.uid;
  const start = session.startedAt.toDate();
  const save = (patch: Parameters<typeof updateSession>[3]) => updateSession(uid, id, session, patch, settings);

  const hoursRunning = (now.getTime() - start.getTime()) / 3_600_000;
  const forgot = active && hoursRunning > settings.forgotFinishHours;
  const lastEntry = session.entries.reduce<Date | null>((m, e) => {
    const d = e.loggedAt.toDate();
    return !m || d > m ? d : m;
  }, null);
  const suggestedEnd = lastEntry ? new Date(lastEntry.getTime() + 10 * 60_000) : new Date(start.getTime() + 3_600_000);

  const sortedEntries = [...session.entries].sort((a, b) => a.loggedAt.toMillis() - b.loggedAt.toMillis());
  const main = shownKcal(settings, session.totals.kcalGross, session.totals.kcalNet);
  const alt = shownKcal({ calorieMode: settings.calorieMode === "net" ? "total" : "net" }, session.totals.kcalGross, session.totals.kcalNet);

  return (
    <div className="stack">
      {forgot && (
        <div className="banner" role="status">
          <strong>Still at {session.locationName ?? "the gym"}?</strong>
          <span> This session started {fmtTime(start)}{start.toDateString() !== now.toDateString() ? ` on ${start.toLocaleDateString()}` : ""}.</span>
          <div className="row">
            <button className="btn primary" onClick={() => void finishSession(uid, id, session, new Date(), null, settings)}>
              Finish now
            </button>
            <button className="btn" onClick={() => setOpen({ type: "finish", end: suggestedEnd })}>Set end time</button>
          </div>
        </div>
      )}

      <header className="card">
        <div className="row between">
          <div>
            <h1 className="tight">{session.locationName ?? "Session"}</h1>
            <div className="muted">
              {active
                ? `Started ${fmtTime(start)}`
                : `${start.toLocaleDateString()} · ${fmtTime(start)}–${session.endedAt ? fmtTime(session.endedAt.toDate()) : "…"}`}
            </div>
          </div>
          {active ? (
            <div className="timer" aria-label="Elapsed time">{fmtElapsed(now.getTime() - start.getTime())}</div>
          ) : (
            <div className="timer">{fmtDuration(session.durationMin)}</div>
          )}
        </div>
        <dl className="summary">
          <div><dt>{settings.calorieMode === "net" ? "Net" : "Total"} kcal</dt><dd>{fmtKcal(main)}</dd></div>
          <div><dt>{settings.calorieMode === "net" ? "Total" : "Net"} kcal</dt><dd>{fmtKcal(alt)}</dd></div>
          <div><dt>Sets</dt><dd>{session.totals.sets}</dd></div>
          <div><dt>Laps</dt><dd>{session.totals.laps}</dd></div>
          {!active && <div><dt>Effort</dt><dd>{session.effort == null ? "–" : num1(session.effort)}</dd></div>}
        </dl>
      </header>

      {!active && <FinishedMeta id={id} session={session} />}

      <div className="row">
        <button className="btn primary grow" onClick={() => setOpen({ type: "lift" })}>Add lifting</button>
        <button className="btn primary grow" onClick={() => setOpen({ type: "swim" })}>Add swim</button>
      </div>

      <ul className="entries">
        {sortedEntries.length === 0 && <li className="muted center-text pad">No exercises yet.</li>}
        {sortedEntries.map((e) => (
          <li key={e.id}>
            <button
              className="entry"
              style={{ borderLeftColor: groupColor(e.group) }}
              onClick={() => setOpen(e.kind === "lift" ? { type: "lift", entry: e } : { type: "swim", entry: e })}
            >
              <div className="entry-main">
                <div className="entry-title">
                  {e.kind === "lift" ? e.exercise : "Swim"}
                  {e.kind === "lift" && <span className="muted"> · {EQUIPMENT_LABEL[e.equipment]}</span>}
                </div>
                <div className="muted small">
                  {e.kind === "lift" ? formatSets(e) : swimDetail(e)}
                </div>
              </div>
              <div className="entry-side">
                {e.rpe != null && <span className="badge">RPE {e.rpe}</span>}
                <span className="kcal">{fmtKcal(shownKcal(settings, e.kcalGross, e.kcalNet))}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Journal
        value={session.journal}
        onSave={(journal) => void save({ journal })}
      />

      {active ? (
        <button className="btn primary block big" onClick={() => setOpen({ type: "finish" })}>Finish session</button>
      ) : (
        <ConfirmButton
          label="Delete session"
          prompt="Delete this whole session and all of its exercises?"
          confirmLabel="Delete session"
          onConfirm={async () => {
            await deleteSession(uid, id);
            navigate("/", { replace: true });
          }}
        />
      )}

      {open?.type === "lift" && <LiftSheet sessionId={id} session={session} entry={open.entry} onClose={() => setOpen(null)} />}
      {open?.type === "swim" && <SwimSheet sessionId={id} session={session} entry={open.entry} onClose={() => setOpen(null)} />}
      {open?.type === "finish" && (
        <FinishSheet sessionId={id} session={session} defaultEnd={open.end} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function swimDetail(e: Extract<Entry, { kind: "swim" }>): string {
  const parts = STROKES.filter((s) => (e.laps[s] ?? 0) > 0).map((s) => `${STROKE_LABEL[s]} ${e.laps[s]}`);
  if (e.treadMinutes > 0) parts.push(`Tread ${e.treadMinutes} min`);
  const d = swimDistance(e);
  const total = totalLaps(e);
  return total > 0 ? `${parts.join(" · ")} · ${d.value} ${d.unit}` : parts.join(" · ");
}

/** Session-level journal. Autosaves 1 s after typing stops and on blur. */
function Journal({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useLatest({ text, onSave });

  useEffect(() => {
    if (!dirty.current) setText(value);
  }, [value]);

  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    latest.current.onSave(latest.current.text);
  };

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="field">
      <label className="field-label" htmlFor="journal">Journal</label>
      <textarea
        id="journal" className="input" rows={4} placeholder="How did it go?" value={text}
        onChange={(e) => {
          setText(e.target.value);
          dirty.current = true;
          latest.current.text = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 1000);
        }}
        onBlur={flush}
      />
    </div>
  );
}

/** Editable context for a finished session (§7.9). */
function FinishedMeta({ id, session }: { id: string; session: Session }) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const patch = (p: Partial<Pick<Session, "startedAt" | "endedAt" | "locationId" | "locationName" | "energy" | "sleep" | "mood">>) =>
    updateSession(user.uid, id, session, p, settings);

  const setTime = (which: "start" | "end", v: string) => {
    const d = fromInputValue(v);
    if (!d) return;
    const s = which === "start" ? d : session.startedAt.toDate();
    const e = which === "end" ? d : session.endedAt?.toDate() ?? null;
    if (e && e <= s) return setError("End time must be after the start time.");
    setError(null);
    void patch(which === "start" ? { startedAt: Timestamp.fromDate(d) } : { endedAt: Timestamp.fromDate(d) });
  };

  return (
    <section className="card stack">
      <h2 className="tight">Details</h2>
      <LocationPicker
        value={{ id: session.locationId, name: session.locationName }}
        onChange={(v) => void patch({ locationId: v.id, locationName: v.name })}
      />
      <div className="row">
        <div className="field grow">
          <label className="field-label" htmlFor="d-start">Start</label>
          <input id="d-start" type="datetime-local" className="input" defaultValue={toInputValue(session.startedAt.toDate())}
            key={session.startedAt.toMillis()} onChange={(e) => setTime("start", e.target.value)} />
        </div>
        <div className="field grow">
          <label className="field-label" htmlFor="d-end">End</label>
          <input id="d-end" type="datetime-local" className="input"
            defaultValue={session.endedAt ? toInputValue(session.endedAt.toDate()) : ""}
            key={session.endedAt?.toMillis() ?? "none"} onChange={(e) => setTime("end", e.target.value)} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <RatingRow label="Energy" value={session.energy} onChange={(v: Rating | null) => void patch({ energy: v })} low="Drained" high="Great" />
      <RatingRow label="Sleep quality" value={session.sleep} onChange={(v: Rating | null) => void patch({ sleep: v })} low="Poor" high="Great" />
      <RatingRow label="Mood" value={session.mood} onChange={(v: Rating | null) => void patch({ mood: v })} low="Low" high="Great" />
      <p className="muted small">RPE for each exercise is set on the exercise itself; effort is their average.</p>
    </section>
  );
}
