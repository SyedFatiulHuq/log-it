import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { convertWeight } from "../calc/weight";
import { localDateString } from "../calc/dates";
import { useActiveSession, useSettings, useWeights } from "../data/hooks";
import { resolveBodyWeightKg, startSession } from "../data/mutations";
import type { Rating } from "../data/types";
import { fromInputValue, num1, toInputValue } from "../ui/format";
import { LocationPicker, type LocationValue } from "./LocationPicker";
import { LogWeightSheet } from "./LogWeightSheet";
import { RatingRow } from "./RatingRow";
import { Sheet } from "./Sheet";
import { useLocations } from "../data/hooks";

interface Props {
  /** "Log past session": start and end both required, session is created finished. */
  past?: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function StartSessionSheet({ past = false, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { data: active } = useActiveSession();
  const { data: locations } = useLocations();

  const [start, setStart] = useState(() => toInputValue(past ? new Date(Date.now() - 3600_000) : new Date()));
  const [end, setEnd] = useState(() => (past ? toInputValue(new Date()) : ""));
  const [loc, setLoc] = useState<LocationValue>({ id: null, name: null });
  const [locTouched, setLocTouched] = useState(false);
  const [energy, setEnergy] = useState<Rating | null>(null);
  const [sleep, setSleep] = useState<Rating | null>(null);
  const [kg, setKg] = useState<number | null>(null);
  const [logWeight, setLogWeight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startDate = fromInputValue(start);
  const dateStr = localDateString(startDate ?? new Date());
  const { data: todays } = useWeights(localDateString(new Date()), localDateString(new Date()));

  // Pre-select the most recently used location once.
  useEffect(() => {
    if (!locTouched && !loc.id && locations[0]) setLoc({ id: locations[0].id, name: locations[0].name });
  }, [locations, locTouched, loc.id]);

  // Weight that will be used for this session's calories (§5.5).
  useEffect(() => {
    if (!user) return;
    let live = true;
    void resolveBodyWeightKg(user.uid, dateStr, settings).then((v) => live && setKg(v));
    return () => { live = false; };
  }, [user, dateStr, settings, todays.length]);

  if (!user) return null;

  if (active && !past) {
    return (
      <Sheet title="Session in progress" onClose={onClose}>
        <p>You already have an active session{active.locationName ? ` at ${active.locationName}` : ""}. Finish or resume it before starting another.</p>
        <button className="btn primary block" onClick={onClose}>Back to session</button>
      </Sheet>
    );
  }
  if (logWeight) return <LogWeightSheet onClose={() => setLogWeight(false)} />;

  const create = async () => {
    const s = fromInputValue(start);
    const e = past ? fromInputValue(end) : null;
    if (!s) return setError("Choose a start time.");
    if (past && !e) return setError("Choose an end time.");
    if (e && e <= s) return setError("End time must be after the start time.");
    setBusy(true);
    try {
      const id = await startSession(user.uid, {
        startedAt: s,
        endedAt: e,
        locationId: loc.id,
        locationName: loc.name,
        energy,
        sleep,
        bodyWeightKg: kg ?? convertWeight(settings.bodyWeight, settings.bodyUnit, "kg"),
      });
      onCreated?.(id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const shown = kg == null ? null : convertWeight(kg, "kg", settings.bodyUnit);

  return (
    <Sheet
      title={past ? "Log past session" : "Start session"}
      onClose={onClose}
      footer={
        <button className="btn primary block" disabled={busy} onClick={() => void create()}>
          {past ? "Create session" : "Start"}
        </button>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="s-start">Start time</label>
        <input id="s-start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      {past && (
        <div className="field">
          <label className="field-label" htmlFor="s-end">End time</label>
          <input id="s-end" type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      )}
      <LocationPicker value={loc} onChange={(v) => { setLocTouched(true); setLoc(v); }} />
      <RatingRow label="Energy" value={energy} onChange={setEnergy} low="Drained" high="Great" />
      <RatingRow label="Sleep quality" value={sleep} onChange={setSleep} low="Poor" high="Great" />
      <div className="field">
        <div className="field-label">Body weight for calories</div>
        <div className="row">
          <span className="grow">{shown == null ? "…" : `${num1(shown)} ${settings.bodyUnit}`}</span>
          {todays.length === 0 && (
            <button type="button" className="btn" onClick={() => setLogWeight(true)}>Log today's weight</button>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </Sheet>
  );
}
