import { useState } from "react";
import { useAuth } from "../auth";
import { minutesBetween } from "../calc/dates";
import { useSettings } from "../data/hooks";
import { finishSession } from "../data/mutations";
import type { Rating, Session } from "../data/types";
import { fmtDuration, fmtKcal, fromInputValue, num1, toInputValue } from "../ui/format";
import { RatingRow } from "./RatingRow";
import { Sheet } from "./Sheet";
import { sessionEffort } from "../calc/calories";

export function FinishSheet({
  sessionId, session, defaultEnd, onClose,
}: { sessionId: string; session: Session; defaultEnd?: Date; onClose: () => void }) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [end, setEnd] = useState(toInputValue(defaultEnd ?? new Date()));
  const [mood, setMood] = useState<Rating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const start = session.startedAt.toDate();
  const endDate = fromInputValue(end);
  const duration = endDate ? minutesBetween(start, endDate) : null;
  const effort = sessionEffort(session.entries);

  const finish = async () => {
    if (!endDate) return setError("Choose an end time.");
    if (endDate <= start) return setError("End time must be after the start time.");
    setBusy(true);
    try {
      await finishSession(user.uid, sessionId, session, endDate, mood, settings);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Finish session"
      onClose={onClose}
      footer={<button className="btn primary block" disabled={busy} onClick={() => void finish()}>Finish</button>}
    >
      <div className="field">
        <label className="field-label" htmlFor="f-end">End time</label>
        <input id="f-end" type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <RatingRow label="Mood" value={mood} onChange={setMood} low="Low" high="Great" />
      <dl className="summary">
        <div><dt>Duration</dt><dd>{fmtDuration(duration)}</dd></div>
        <div><dt>Exercises</dt><dd>{session.entries.length}</dd></div>
        <div><dt>Sets</dt><dd>{session.totals.sets}</dd></div>
        <div><dt>Laps</dt><dd>{session.totals.laps}</dd></div>
        <div><dt>Effort</dt><dd>{effort == null ? "–" : num1(effort)}</dd></div>
        <div><dt>Net kcal</dt><dd>{fmtKcal(session.totals.kcalNet)}</dd></div>
        <div><dt>Total kcal</dt><dd>{fmtKcal(session.totals.kcalGross)}</dd></div>
      </dl>
      {error && <p className="error">{error}</p>}
    </Sheet>
  );
}
