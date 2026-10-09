import type { Rating } from "../data/types";

export function RatingRow({
  label, value, onChange, low, high,
}: { label: string; value: Rating | null; onChange: (v: Rating | null) => void; low: string; high: string }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="rating" role="radiogroup" aria-label={label}>
        {([1, 2, 3, 4, 5] as Rating[]).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`dot${value === n ? " on" : ""}`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="rating-ends muted"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}
