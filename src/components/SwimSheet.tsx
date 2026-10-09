import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "../auth";
import { STROKES, swimDistance, swimKcal, totalLaps } from "../calc/calories";
import { useSettings } from "../data/hooks";
import { removeEntry, upsertEntry } from "../data/mutations";
import type { Pool, Session, Stroke, SwimEntry } from "../data/types";
import { STROKE_LABEL, fmtKcal, fromInputValue, shownKcal, toInputValue } from "../ui/format";
import { ConfirmButton } from "./ConfirmButton";
import { RpePicker } from "./RpePicker";
import { Sheet } from "./Sheet";
import { Stepper } from "./Stepper";

const POOLS: { value: Pool; label: string }[] = [
  { value: "25m", label: "25 m" },
  { value: "25yd", label: "25 yd" },
  { value: "50m", label: "50 m" },
];

export function SwimSheet({
  sessionId, session, entry, onClose,
}: { sessionId: string; session: Session; entry?: SwimEntry; onClose: () => void }) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [pool, setPool] = useState<Pool>(entry?.pool ?? settings.defaultPool);
  const [laps, setLaps] = useState<Partial<Record<Stroke, number>>>(entry?.laps ?? {});
  const [tread, setTread] = useState(entry?.treadMinutes ?? 0);
  const [rpe, setRpe] = useState<number | null>(entry?.rpe ?? null);
  const [loggedAt, setLoggedAt] = useState(entry ? toInputValue(entry.loggedAt.toDate()) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const draft = { laps, pool, treadMinutes: tread };
  const kcal = swimKcal(draft, session.bodyWeightKg);
  const dist = swimDistance(draft);
  const lapsTotal = totalLaps(draft);

  const save = async () => {
    if (lapsTotal === 0 && tread === 0) return setError("Add at least one lap or one minute.");
    const at = entry ? (fromInputValue(loggedAt) ?? entry.loggedAt.toDate()) : new Date();
    setBusy(true);
    try {
      await upsertEntry(
        user.uid, sessionId, session,
        {
          id: entry?.id,
          kind: "swim",
          group: "swim",
          loggedAt: Timestamp.fromDate(at),
          rpe,
          pool,
          laps: Object.fromEntries(STROKES.filter((s) => (laps[s] ?? 0) > 0).map((s) => [s, laps[s]])),
          treadMinutes: tread,
        },
        settings,
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={entry ? "Edit swim" : "Add swim"}
      onClose={onClose}
      footer={
        <div className="stack">
          <div className="muted center-text">
            {lapsTotal} laps · {dist.value} {dist.unit} · ≈ {fmtKcal(shownKcal(settings, kcal.gross, kcal.net))} kcal ({settings.calorieMode})
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn primary block" disabled={busy} onClick={() => void save()}>Save</button>
        </div>
      }
    >
      <div className="field">
        <div className="field-label">Pool length</div>
        <div className="seg" role="radiogroup" aria-label="Pool length">
          {POOLS.map((p) => (
            <button key={p.value} type="button" role="radio" aria-checked={pool === p.value}
              className={pool === p.value ? "on" : ""} onClick={() => setPool(p.value)}>{p.label}</button>
          ))}
        </div>
        <p className="muted small">One lap = there and back.</p>
      </div>

      {STROKES.map((s) => (
        <Stepper key={s} label={STROKE_LABEL[s]} value={laps[s] ?? 0} unit="laps"
          onChange={(v) => setLaps((cur) => ({ ...cur, [s]: v }))} />
      ))}
      <Stepper label="Treading water" value={tread} unit="min" onChange={setTread} />

      <RpePicker value={rpe} onChange={setRpe} />

      {entry && (
        <>
          <div className="field">
            <label className="field-label" htmlFor="logged">Logged at</label>
            <input id="logged" type="datetime-local" className="input" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
          </div>
          <ConfirmButton
            label="Delete swim"
            prompt="Delete this swim from the session?"
            onConfirm={async () => {
              await removeEntry(user.uid, sessionId, session, entry.id, settings);
              onClose();
            }}
          />
        </>
      )}
    </Sheet>
  );
}
