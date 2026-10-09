import { Link, useParams } from "react-router-dom";
import { SessionView } from "../components/SessionView";
import { useSession } from "../data/hooks";

export function SessionDetailScreen() {
  const { id = "" } = useParams();
  const { data, loading } = useSession(id);

  return (
    <div className="stack">
      <Link to="/" className="back">← Back</Link>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : !data ? (
        <p className="muted">Session not found.</p>
      ) : (
        <SessionView id={data.id} session={data} active={data.status === "active"} />
      )}
    </div>
  );
}
