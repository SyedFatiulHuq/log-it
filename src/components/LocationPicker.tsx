import { useState } from "react";
import { useAuth } from "../auth";
import { useLocations } from "../data/hooks";
import { addLocation } from "../data/mutations";

export interface LocationValue { id: string | null; name: string | null }

export function LocationPicker({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const { user } = useAuth();
  const { data: locations } = useLocations();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const add = async () => {
    if (!user || !name.trim()) return;
    const id = await addLocation(user.uid, name);
    onChange({ id, name: name.trim() });
    setName("");
    setAdding(false);
  };

  const known = value.id != null && locations.some((l) => l.id === value.id);

  return (
    <div className="field">
      <label className="field-label" htmlFor="loc">Location</label>
      {adding ? (
        <div className="row">
          <input
            id="loc" className="input grow" autoFocus placeholder="e.g. Campus gym" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
          />
          <button type="button" className="btn primary" onClick={() => void add()}>Add</button>
          <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <select
          id="loc" className="input"
          value={value.id ?? ""}
          onChange={(e) => {
            if (e.target.value === "__new") return setAdding(true);
            const l = locations.find((x) => x.id === e.target.value);
            onChange(l ? { id: l.id, name: l.name } : { id: null, name: null });
          }}
        >
          <option value="">No location</option>
          {!known && value.id && <option value={value.id}>{value.name}</option>}
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value="__new">＋ Add new location…</option>
        </select>
      )}
    </div>
  );
}
