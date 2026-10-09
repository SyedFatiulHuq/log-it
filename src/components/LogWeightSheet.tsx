import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { convertWeight } from "../calc/weight";
import { localDateString } from "../calc/dates";
import { useSettings, useWeights } from "../data/hooks";
import {
  deleteWeight, previousWeight, recalculateSessionsOnDate, saveWeight, sessionsOnDate,
} from "../data/mutations";
import type { Unit } from "../data/types";
import { fmtDay, num1 } from "../ui/format";
import { ConfirmButton } from "./ConfirmButton";
import { Sheet } from "./Sheet";

export function LogWeightSheet({ date: initial, onClose }: { date?: string; onClose: () => void }) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [date, setDate] = useState(initial ?? localDateString(new Date()));
  const { data: existing } = useWeights(date, date);
  const current = existing[0] ?? null;

  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<Unit>(settings.bodyUnit);
  const [prev, setPrev] = useState<{ date: string; weight: number; unit: Unit } | null>(null);
  const [offer, setOffer] = useState<{ count: number; kg: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (current) {
      setWeight(String(current.weight));
      setUnit(current.unit);
    } else {
      setWeight("");
    }
  }, [current?.weight, current?.unit, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    let live = true;
    void previousWeight(user.uid, date).then((p) => live && setPrev(p));
    return () => { live = false; };
  }, [user, date]);

  if (!user) return null;
  const parsed = Number(weight);
  const valid = weight.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  const change = valid && prev ? parsed - convertWeight(prev.weight, prev.unit, unit) : null;

  const save = async () => {
    if (!valid) return setError("Enter a weight greater than 0.");
    setBusy(true);
    try {
      await saveWeight(user.uid, date, parsed, unit, settings);
      const sessions = await sessionsOnDate(user.uid, date);
      if (sessions.length) setOffer({ count: sessions.length, kg: convertWeight(parsed, unit, "kg") });
      else onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (offer) {
    return (
      <Sheet title="Weight saved" onClose={onClose}>
        <p>
          {offer.count === 1 ? "There is 1 session" : `There are ${offer.count} sessions`} on {fmtDay(date)} that
          used a different weight for calories.
        </p>
        <div className="stack">
          <button
            className="btn primary"
            onClick={async () => {
              await recalculateSessionsOnDate(user.uid, date, offer.kg, settings);
              onClose();
            }}
          >
            Recalculate those sessions with this weight
          </button>
          <button className="btn" onClick={onClose}>Keep existing calories</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Log weight"
      onClose={onClose}
      footer={<button className="btn primary block" disabled={busy} onClick={() => void save()}>Save</button>}
    >
      <div className="field">
        <label className="field-label" htmlFor="w-date">Date</label>
        <input id="w-date" type="date" className="input" value={date} max={localDateString(new Date())}
          onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="w-val">Weight</label>
        <div className="row">
          <input id="w-val" className="input grow" inputMode="decimal" placeholder="0.0" value={weight}
            onChange={(e) => setWeight(e.target.value)} autoFocus />
          <select className="input unit" aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </div>
      {prev && (
        <p className="muted">
          Previous: {num1(prev.weight)} {prev.unit} on {fmtDay(prev.date)}
          {change != null && ` (${change >= 0 ? "+" : ""}${num1(change)} ${unit})`}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {current && (
        <ConfirmButton
          label="Delete this weigh-in"
          prompt={`Delete the weigh-in for ${fmtDay(date)}?`}
          onConfirm={async () => {
            await deleteWeight(user.uid, date);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}
