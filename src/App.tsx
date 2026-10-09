import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { SessionScreen } from "./screens/SessionScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { ExportScreen } from "./screens/ExportScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

function SignIn() {
  const { signIn, denied } = useAuth();
  const [failure, setFailure] = useState<string | null>(null);
  const onClick = () => {
    setFailure(null);
    signIn().catch((e: { code?: string; message?: string }) =>
      setFailure(`${e.code ?? "error"}: ${e.message ?? "sign-in failed"}`),
    );
  };
  return (
    <main className="page center">
      <h1>Log It!</h1>
      <p className="muted">Gym &amp; pool session log</p>
      <button className="btn primary" onClick={onClick}>
        Sign in with Google
      </button>
      {denied && <p className="error">{denied} is not allowed to use this app.</p>}
      {failure && <p className="error">{failure}</p>}
    </main>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <main className="page center muted">Loading…</main>;
  if (!user) return <SignIn />;

  return (
    <div className="shell">
      <div className="page">
        <Routes>
          <Route path="/" element={<SessionScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/export" element={<ExportScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>Session</NavLink>
        <NavLink to="/calendar">Calendar</NavLink>
        <NavLink to="/export">Export</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
    </div>
  );
}
