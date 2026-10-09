import { useAuth } from "../auth";

export function SettingsScreen() {
  const { user, signOutUser } = useAuth();
  return (
    <section>
      <h1>Settings</h1>
      <p className="muted">Signed in as {user?.email}</p>
      <button className="btn" onClick={() => void signOutUser()}>
        Sign out
      </button>
    </section>
  );
}
