import { useEffect, useRef, useState } from "react";

/** Re-renders every `ms` and returns the current time. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Re-renders when the tab becomes visible again (used by the forgotten-finish check). */
export function useVisibilityTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && setN((v) => v + 1);
    document.addEventListener("visibilitychange", on);
    window.addEventListener("focus", on);
    return () => {
      document.removeEventListener("visibilitychange", on);
      window.removeEventListener("focus", on);
    };
  }, []);
  return n;
}

/** Keeps the latest value in a ref, for use in debounced callbacks. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
