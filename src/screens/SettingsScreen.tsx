import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";
import { firebaseConfig } from "../firebase-config";
import { useAuth } from "../auth";
import { convertWeight } from "../calc/weight";
import { GROUP_LABEL } from "../data/defaults";
import { useExercises, useLocations, useRecentSessions, useSettings } from "../data/hooks";
import {
  deleteExercise, deleteLocation, renameLocation, saveSettings, updateCustomExercise,
} from "../data/mutations";
import type { LiftGroup, Pool, Settings, Unit } from "../data/types";
import { ConfirmButton } from "../components/ConfirmButton";
import { fmtTime } from "../ui/format";

// Default compute service account for 2nd-gen functions: <project number>-compute@developer.gserviceaccount.com
const SERVICE_ACCOUNT = `${firebaseConfig.messagingSenderId}-compute@developer.gserviceaccount.com`;

function extractSheetId(input: string): string | null {
  const m = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(input.trim()) ? input.trim() : null;
}

/** Number field that commits on blur, so typing isn't interrupted by writes. */
function NumberField({
  label, value, onCommit, min = 0, suffix,
}: { label: string; value: number; onCommit: (n: number) => void; min?: number; suffix?: string }) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setText(String(value)); }
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="row">
        <input className="input grow" inputMode="decimal" value={text} aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = Number(text);
            if (Number.isFinite(n) && n >= min) onCommit(n); else setText(String(value));
          }} />
        {suffix && <span className="muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const { user, signOutUser } = useAuth();
  const { data: s } = useSettings();
  const { data: locations } = useLocations();
  const { data: exercises } = useExercises();
  const { data: recent } = useRecentSessions(30);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetMsg, setSheetMsg] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  if (!user) return null;
  const uid = user.uid;
  const set = (p: Partial<Settings>) => void saveSettings(uid, p);

  const lastSync = recent.find((x) => x.sheetSync);
  const customs = exercises.filter((e) => !e.builtIn);

  const connect = () => {
    const id = extractSheetId(sheetUrl);
    if (!id) return setSheetMsg("That doesn't look like a Google Sheets URL.");
    set({ sheetId: id });
    setSheetUrl("");
    setSheetMsg("Sheet connected. Share it with the service account below, then use Rebuild sheet.");
  };

  const rebuild = async () => {
    setRebuilding(true);
    setSheetMsg(null);
    try {
      const fn = httpsCallable<unknown, { rows: number }>(getFunctions(app, "us-west2"), "rebuildSheet");
      const res = await fn();
      setSheetMsg(`Sheet rebuilt: ${res.data.rows} rows written.`);
    } catch (e) {
      setSheetMsg((e as Error).message);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="stack">
      <h1>Settings</h1>

      <section className="card stack">
        <h2 className="tight">Units &amp; body</h2>
        <Segmented<Unit> label="Body weight unit" value={s.bodyUnit} options={[["lb", "lb"], ["kg", "kg"]]}
          onChange={(u) => set({ bodyUnit: u, bodyWeight: Math.round(convertWeight(s.bodyWeight, s.bodyUnit, u) * 10) / 10 })} />
        <NumberField label={`Fallback body weight (${s.bodyUnit})`} value={s.bodyWeight} min={1}
          onCommit={(n) => set({ bodyWeight: n })} />
        <p className="muted small">Used only until your first weigh-in; after that the latest weigh-in is used.</p>
        <Segmented<Unit> label="Lifting unit" value={s.liftUnit} options={[["lb", "lb"], ["kg", "kg"]]}
          onChange={(u) => set({ liftUnit: u })} />
      </section>

      <section className="card stack">
        <h2 className="tight">Calories</h2>
        <Segmented label="Show" value={s.calorieMode} options={[["net", "Net"], ["total", "Total"]]}
          onChange={(v) => set({ calorieMode: v })} />
        <Segmented label="Rest between sets" value={s.restMode} options={[["fixed", "Fixed"], ["actual", "From session time"]]}
          onChange={(v) => set({ restMode: v })} />
        <NumberField label="Rest seconds (fixed)" value={s.restSec} min={0} suffix="s" onCommit={(n) => set({ restSec: n })} />
        <NumberField label="Eat back" value={s.eatBackPct} min={0} suffix="%" onCommit={(n) => set({ eatBackPct: n })} />
      </section>

      <section className="card stack">
        <h2 className="tight">Sessions</h2>
        <Segmented<Pool> label="Default pool" value={s.defaultPool}
          options={[["25m", "25 m"], ["25yd", "25 yd"], ["50m", "50 m"]]} onChange={(v) => set({ defaultPool: v })} />
        <NumberField label="Warn about unfinished sessions after" value={s.forgotFinishHours} min={1} suffix="hours"
          onCommit={(n) => set({ forgotFinishHours: n })} />
      </section>

      <section className="card stack">
        <h2 className="tight">Google Sheet</h2>
        <p className="muted small">
          Finished sessions and weigh-ins are mirrored to a sheet you own. Share it as <strong>Editor</strong> with:
        </p>
        <code className="code">{SERVICE_ACCOUNT}</code>
        {s.sheetId && <p className="small">Connected sheet ID: <code>{s.sheetId}</code></p>}
        <div className="row">
          <input className="input grow" placeholder="Paste Google Sheet URL" value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)} aria-label="Google Sheet URL" />
          <button className="btn" onClick={connect}>Connect</button>
        </div>
        <button className="btn" disabled={!s.sheetId || rebuilding} onClick={() => void rebuild()}>
          {rebuilding ? "Rebuilding…" : "Rebuild sheet"}
        </button>
        {sheetMsg && <p className="muted" role="status">{sheetMsg}</p>}
        <p className="muted small">
          Last sync:{" "}
          {lastSync?.sheetSync
            ? `${lastSync.sheetSync.state === "ok" ? "OK" : `Error — ${lastSync.sheetSync.error ?? "unknown"}`} · ${fmtTime(lastSync.sheetSync.syncedAt.toDate())}`
            : "none yet"}
        </p>
      </section>

      <section className="card stack">
        <h2 className="tight">Locations</h2>
        {locations.length === 0 && <p className="muted">Locations you add when starting a session appear here.</p>}
        {locations.map((l) => <LocationRow key={l.id} uid={uid} id={l.id} name={l.name} />)}
      </section>

      <section className="card stack">
        <h2 className="tight">Custom exercises</h2>
        {customs.length === 0 && <p className="muted">Exercises you add yourself appear here.</p>}
        {customs.map((e) => <ExerciseRow key={e.id} uid={uid} name={e.name} group={e.group} />)}
      </section>

      <section className="card stack">
        <h2 className="tight">How calories are estimated</h2>
        <p className="small">
          Calories use the MET method: MET × body weight × hours. Lifting counts 3 seconds of work per rep (MET 6.0)
          plus rest between sets (MET 2.5), scaled by muscle group (arms 0.8, upper body 1.0, legs 1.3). The weight you
          lift doesn't change the estimate. Swimming uses a MET and pace for each stroke, scaled by pool length.
          <strong> Net</strong> subtracts what you would burn sitting still over the same time. These are estimates,
          not measurements.
        </p>
      </section>

      <section className="card stack">
        <p className="muted">Signed in as {user.email}</p>
        <button className="btn" onClick={() => void signOutUser()}>Sign out</button>
      </section>
    </div>
  );
}

function LocationRow({ uid, id, name }: { uid: string; id: string; name: string }) {
  const [text, setText] = useState(name);
  return (
    <div className="stack">
      <div className="row">
        <input className="input grow" value={text} aria-label={`Rename ${name}`} onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && text !== name && void renameLocation(uid, id, text)} />
      </div>
      <ConfirmButton label="Remove" prompt={`Remove ${name}? Existing sessions keep their location name.`} confirmLabel="Remove"
        onConfirm={() => void deleteLocation(uid, id)} />
    </div>
  );
}

function ExerciseRow({ uid, name, group }: { uid: string; name: string; group: LiftGroup }) {
  const [text, setText] = useState(name);
  const commit = (next: { name: string; group: LiftGroup }) => void updateCustomExercise(uid, name, next);
  return (
    <div className="stack">
      <input className="input" value={text} aria-label={`Rename ${name}`} onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() && text !== name && commit({ name: text, group })} />
      <select className="input" value={group} aria-label={`Group for ${name}`}
        onChange={(e) => commit({ name, group: e.target.value as LiftGroup })}>
        {(["arms", "upper", "legs"] as LiftGroup[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
      </select>
      <ConfirmButton label="Remove" prompt={`Remove ${name}? Past entries are not changed.`} confirmLabel="Remove"
        onConfirm={() => void deleteExercise(uid, name)} />
    </div>
  );
}
