export function rpeLabel(v: number): string {
  if (v <= 3) return "Very easy";
  if (v <= 5) return "Easy";
  if (v === 6) return "Moderate, 4+ reps left";
  if (v === 7) return "Hard, ~3 reps left";
  if (v === 8) return "Very hard, ~2 reps left";
  if (v === 9) return "~1 rep left";
  return "Max effort";
}

export function RpePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="field">
      <div className="field-label">RPE (optional)</div>
      <div className="rpe" role="radiogroup" aria-label="RPE">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`chip${value === n ? " on" : ""}`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="muted rpe-label">{value ? rpeLabel(value) : "Tap to rate this exercise"}</div>
    </div>
  );
}
