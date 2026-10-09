import { useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "../auth";
import { liftKcal } from "../calc/calories";
import { slugify } from "../calc/dates";
import { formatSets, formatWeightValue, supportsPair } from "../calc/weight";
import { BUILT_IN_EXERCISES, GROUP_LABEL } from "../data/defaults";
import { useExercises, useRecentSessions, useSettings } from "../data/hooks";
import {
  createCustomExercise, removeEntry, saveExercisePreference, upsertEntry,
} from "../data/mutations";
import type { Equipment, LiftEntry, LiftGroup, Session } from "../data/types";
import { EQUIPMENT_LABEL, fmtDay, fmtKcal, fromInputValue, shownKcal, toInputValue } from "../ui/format";
import { ConfirmButton } from "./ConfirmButton";
import { RpePicker } from "./RpePicker";
import { Sheet } from "./Sheet";

const EQUIPMENT: Equipment[] = ["dumbbell", "barbell", "machine", "cable", "kettlebell", "smith", "bodyweight", "band"];
const LIFT_GROUPS: LiftGroup[] = ["arms", "upper", "legs"];

interface ExerciseRef { name: string; group: LiftGroup; builtIn: boolean }
interface SetDraft { weight: string; reps: string }

interface Props {
  sessionId: string;
  session: Session;
  entry?: LiftEntry;
  onClose: () => void;
}

export function LiftSheet({ sessionId, session, entry, onClose }: Props) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { data: prefs } = useExercises();
  const { data: recent } = useRecentSessions(40);

  const [ex, setEx] = useState<ExerciseRef | null>(
    entry ? { name: entry.exercise, group: entry.group, builtIn: BUILT_IN_EXERCISES.some((b) => b.name === entry.exercise) } : null,
  );
  const [picking, setPicking] = useState(!entry);
  const [equipment, setEquipment] = useState<Equipment>(entry?.equipment ?? "machine");
  const [count, setCount] = useState<1 | 2>(entry?.count ?? 2);
  const [band, setBand] = useState(entry?.bandLabel ?? "");
  const [sets, setSets] = useState<SetDraft[]>(
    entry ? entry.sets.map((s) => ({ weight: s.weight == null ? "" : String(s.weight), reps: String(s.reps) })) : [{ weight: "", reps: "" }],
  );
  const [rpe, setRpe] = useState<number | null>(entry?.rpe ?? null);
  const [loggedAt, setLoggedAt] = useState(entry ? toInputValue(entry.loggedAt.toDate()) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unit = entry?.unit ?? settings.liftUnit;

  // Most recent earlier entry of the same exercise: "Last time".
  const last = useMemo(() => {
    if (!ex) return null;
    let best: { date: string; entry: LiftEntry; at: number } | null = null;
    for (const s of [...recent, { ...session, id: sessionId }]) {
      for (const e of s.entries) {
        if (e.kind !== "lift" || e.exercise !== ex.name || e.id === entry?.id) continue;
        const at = e.loggedAt.toMillis();
        if (!best || at > best.at) best = { date: s.date, entry: e, at };
      }
    }
    return best;
  }, [ex, recent, session, sessionId, entry?.id]);

  if (!user) return null;

  const choose = (e: ExerciseRef, defEq: Equipment, defCount: 1 | 2) => {
    const pref = prefs.find((p) => p.id === slugify(e.name));
    setEx(e);
    setEquipment((pref?.lastEquipment as Equipment | undefined) ?? defEq);
    setCount(pref?.lastCount ?? defCount);
    setPicking(false);
  };

  if (picking) {
    return (
      <ExercisePicker
        onClose={entry ? () => setPicking(false) : onClose}
        onPick={choose}
        customs={prefs.filter((p) => !p.builtIn).map((p) => ({ name: p.name, group: p.group }))}
        uid={user.uid}
      />
    );
  }

  const parsed = sets
    .map((s) => ({
      weight: equipment === "band" || s.weight.trim() === "" ? null : Number(s.weight),
      reps: Math.floor(Number(s.reps)),
    }))
    .filter((s) => Number.isFinite(s.reps) && s.reps > 0);
  const preview = ex ? liftKcal(parsed, settings.restSec, session.bodyWeightKg, ex.group) : null;

  const patchSet = (i: number, p: Partial<SetDraft>) => setSets((cur) => cur.map((s, j) => (j === i ? { ...s, ...p } : s)));

  const save = async () => {
    if (!ex) return setError("Choose an exercise.");
    if (parsed.length === 0) return setError("Add at least one set with reps.");
    if (parsed.some((s) => s.weight != null && !Number.isFinite(s.weight))) return setError("Weights must be numbers.");
    const at = entry ? (fromInputValue(loggedAt) ?? entry.loggedAt.toDate()) : new Date();
    const pair = supportsPair(equipment) ? count : 1;
    setBusy(true);
    try {
      await upsertEntry(
        user.uid, sessionId, session,
        {
          id: entry?.id,
          kind: "lift",
          loggedAt: Timestamp.fromDate(at),
          rpe,
          exercise: ex.name,
          group: ex.group,
          equipment,
          count: pair,
          unit,
          bandLabel: equipment === "band" ? band.trim() || undefined : undefined,
          sets: parsed,
        },
        settings,
      );
      await saveExercisePreference(user.uid, ex, equipment, pair);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const weightHeader =
    equipment === "dumbbell" || equipment === "kettlebell" ? `Each (${unit})`
    : equipment === "bodyweight" ? `Added (${unit})`
    : `Weight (${unit})`;

  const draftEntry = { equipment, count: supportsPair(equipment) ? count : 1, bandLabel: band, unit };

  return (
    <Sheet
      title={entry ? "Edit exercise" : "Add lifting"}
      onClose={onClose}
      footer={
        <div className="stack">
          {preview && (
            <div className="muted center-text">
              ≈ {fmtKcal(shownKcal(settings, preview.gross, preview.net))} kcal ({settings.calorieMode})
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn primary block" disabled={busy} onClick={() => void save()}>Save</button>
        </div>
      }
    >
      <button type="button" className="btn block left" onClick={() => setPicking(true)}>
        {ex ? <><strong>{ex.name}</strong> <span className="muted">· {GROUP_LABEL[ex.group]}</span></> : "Choose exercise…"}
      </button>
      {last && (
        <p className="muted small">
          Last time ({fmtDay(last.date)}): {EQUIPMENT_LABEL[last.entry.equipment]} · {formatSets(last.entry)}
        </p>
      )}

      <div className="field">
        <div className="field-label">Equipment</div>
        <div className="chips">
          {EQUIPMENT.map((eq) => (
            <button key={eq} type="button" className={`chip${equipment === eq ? " on" : ""}`} onClick={() => setEquipment(eq)}>
              {EQUIPMENT_LABEL[eq]}
            </button>
          ))}
        </div>
      </div>

      {supportsPair(equipment) && (
        <div className="field">
          <div className="seg" role="radiogroup" aria-label="One or pair">
            <button type="button" role="radio" aria-checked={count === 1} className={count === 1 ? "on" : ""} onClick={() => setCount(1)}>One</button>
            <button type="button" role="radio" aria-checked={count === 2} className={count === 2 ? "on" : ""} onClick={() => setCount(2)}>Pair</button>
          </div>
        </div>
      )}

      {equipment === "band" && (
        <div className="field">
          <label className="field-label" htmlFor="band">Band</label>
          <input id="band" className="input" list="band-list" placeholder="light / medium / heavy" value={band}
            onChange={(e) => setBand(e.target.value)} />
          <datalist id="band-list"><option value="light" /><option value="medium" /><option value="heavy" /></datalist>
        </div>
      )}

      <div className="sets">
        <div className="set-head muted small">
          <span>Set</span>
          {equipment !== "band" && <span>{weightHeader}</span>}
          <span>Reps</span>
          <span />
        </div>
        {sets.map((s, i) => (
          <div className="set-row" key={i}>
            <span className="set-n">{i + 1}</span>
            {equipment !== "band" && (
              <div className="set-weight">
                <input className="input" inputMode="decimal" aria-label={`Set ${i + 1} weight`}
                  placeholder={equipment === "bodyweight" ? "BW" : ""} value={s.weight}
                  onChange={(e) => patchSet(i, { weight: e.target.value })} />
                {supportsPair(equipment) && count === 2 && s.weight.trim() !== "" && Number.isFinite(Number(s.weight)) && (
                  <span className="muted small">{formatWeightValue({ ...draftEntry, equipment }, Number(s.weight))}</span>
                )}
              </div>
            )}
            <input className="input" inputMode="numeric" aria-label={`Set ${i + 1} reps`} id={`reps-${i}`}
              value={s.reps} onChange={(e) => patchSet(i, { reps: e.target.value })} />
            <button type="button" className="icon-btn" aria-label={`Remove set ${i + 1}`}
              disabled={sets.length === 1} onClick={() => setSets((cur) => cur.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button
          type="button" className="btn block"
          onClick={() => {
            const prev = sets[sets.length - 1];
            setSets((cur) => [...cur, { weight: prev?.weight ?? "", reps: prev?.reps ?? "" }]);
            setTimeout(() => document.getElementById(`reps-${sets.length}`)?.focus(), 0);
          }}
        >
          + Add set
        </button>
      </div>

      <RpePicker value={rpe} onChange={setRpe} />

      {entry && (
        <>
          <div className="field">
            <label className="field-label" htmlFor="logged">Logged at</label>
            <input id="logged" type="datetime-local" className="input" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
          </div>
          <ConfirmButton
            label="Delete exercise"
            prompt={`Delete ${entry.exercise} from this session?`}
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

function ExercisePicker({
  onClose, onPick, customs, uid,
}: {
  onClose: () => void;
  onPick: (e: ExerciseRef, equipment: Equipment, count: 1 | 2) => void;
  customs: { name: string; group: LiftGroup }[];
  uid: string;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<LiftGroup>("upper");

  const needle = q.trim().toLowerCase();
  const match = (n: string) => n.toLowerCase().includes(needle);

  const addCustom = async () => {
    if (!name.trim()) return;
    await createCustomExercise(uid, name, group);
    onPick({ name: name.trim(), group, builtIn: false }, "machine", 1);
  };

  return (
    <Sheet title="Choose exercise" onClose={onClose}>
      <input className="input" type="search" placeholder="Search exercises" value={q} autoFocus
        onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
      {LIFT_GROUPS.map((g) => {
        const builtIns = BUILT_IN_EXERCISES.filter((b) => b.group === g && match(b.name));
        const mine = customs.filter((c) => c.group === g && match(c.name));
        if (builtIns.length + mine.length === 0) return null;
        return (
          <section key={g} className="pick-group">
            <h3 style={{ color: `var(--${g})` }}>{GROUP_LABEL[g]}</h3>
            {builtIns.map((b) => (
              <button key={b.name} className="pick" onClick={() => onPick({ name: b.name, group: g, builtIn: true }, b.equipment, b.count)}>
                {b.name}
              </button>
            ))}
            {mine.map((c) => (
              <button key={c.name} className="pick" onClick={() => onPick({ name: c.name, group: g, builtIn: false }, "machine", 1)}>
                {c.name} <span className="muted small">custom</span>
              </button>
            ))}
          </section>
        );
      })}
      {adding ? (
        <div className="field">
          <div className="field-label">New exercise</div>
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="chips">
            {LIFT_GROUPS.map((g) => (
              <button key={g} className={`chip${group === g ? " on" : ""}`} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}</button>
            ))}
          </div>
          <button className="btn primary block" onClick={() => void addCustom()}>Add exercise</button>
        </div>
      ) : (
        <button className="btn block" onClick={() => { setAdding(true); setName(q); }}>＋ Add your own</button>
      )}
    </Sheet>
  );
}
