export function Stepper({
  label, value, onChange, unit, step = 1,
}: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number }) {
  return (
    <div className="stepper-row">
      <span className="stepper-label">{label}</span>
      <div className="stepper">
        <button type="button" className="btn sq" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(0, value - step))}>−</button>
        <span className="stepper-val">{value}{unit ? ` ${unit}` : ""}</span>
        <button type="button" className="btn sq" aria-label={`More ${label}`} onClick={() => onChange(value + step)}>+</button>
      </div>
    </div>
  );
}
