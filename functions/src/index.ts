import { initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  liftingRows, sessionRow, swimmingRows, weightRow, type SessionDoc, type WeightDoc,
} from "./rows";
import {
  appendRows, deleteRowsByKey, ensureTabs, getSheets, rebuildAll, replaceWeightRow, setEatBack,
} from "./sheets";

initializeApp();
// Same region as the Firestore database (us-west2) so triggers can be created.
setGlobalOptions({ region: "us-west2" });
const db = getFirestore();

// Single-user allowlist; keep in sync with firestore.rules and src/firebase-config.ts.
const ALLOWED_EMAIL = "fsyedhuq@uci.edu";

async function loadSettings(uid: string): Promise<{ sheetId: string | null; eatBackPct: number }> {
  const snap = await db.doc(`users/${uid}`).get();
  const d = snap.data() ?? {};
  return { sheetId: (d.sheetId as string | null) ?? null, eatBackPct: (d.eatBackPct as number | undefined) ?? 50 };
}

/** Mirrors a finished session into the sheet: delete its old rows, append the new ones. */
export const onSessionWritten = onDocumentWritten(
  { document: "users/{uid}/sessions/{sessionId}", maxInstances: 1, retry: true },
  async (event) => {
    const { uid, sessionId } = event.params;
    const before = event.data?.before.data() as (SessionDoc & { updatedAt?: Timestamp }) | undefined;
    const after = event.data?.after.data() as (SessionDoc & { updatedAt?: Timestamp }) | undefined;

    // Our own sheetSync write (or any write that didn't change updatedAt) is not a change to mirror.
    if (before && after && before.updatedAt?.toMillis() === after.updatedAt?.toMillis()) return;

    const nowFinished = after?.status === "finished";
    const wasFinished = before?.status === "finished";
    if (!nowFinished && !wasFinished) return; // active sessions are never mirrored

    const { sheetId, eatBackPct } = await loadSettings(uid);
    if (!sheetId) return;

    const ref = db.doc(`users/${uid}/sessions/${sessionId}`);
    try {
      const sheets = getSheets();
      const ids = await ensureTabs(sheets, sheetId, eatBackPct);
      for (const tab of ["Sessions", "Lifting", "Swimming"]) {
        await deleteRowsByKey(sheets, sheetId, tab, ids.get(tab)!, sessionId);
      }
      if (nowFinished && after) {
        await appendRows(sheets, sheetId, "Sessions", [sessionRow(sessionId, after)]);
        await appendRows(sheets, sheetId, "Lifting", liftingRows(sessionId, after));
        await appendRows(sheets, sheetId, "Swimming", swimmingRows(sessionId, after));
      }
      await setEatBack(sheets, sheetId, eatBackPct);
      if (after) await ref.update({ sheetSync: { state: "ok", syncedAt: Timestamp.now() } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (after) await ref.update({ sheetSync: { state: "error", syncedAt: Timestamp.now(), error: message.slice(0, 300) } });
      throw err; // rethrow so the retry policy handles transient failures
    }
  },
);

export const onWeightWritten = onDocumentWritten(
  { document: "users/{uid}/weights/{date}", maxInstances: 1, retry: true },
  async (event) => {
    const { uid, date } = event.params;
    const after = event.data?.after.data() as WeightDoc | undefined;
    const before = event.data?.before.data() as WeightDoc | undefined;
    if (before && after && before.weight === after.weight && before.unit === after.unit) return;

    const { sheetId, eatBackPct } = await loadSettings(uid);
    if (!sheetId) return;
    const sheets = getSheets();
    const ids = await ensureTabs(sheets, sheetId, eatBackPct);
    await replaceWeightRow(sheets, sheetId, ids.get("Body weight")!, date, after ? weightRow(after) : null);
  },
);

export const rebuildSheet = onCall({ maxInstances: 1, timeoutSeconds: 300 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth?.token.email !== ALLOWED_EMAIL) throw new HttpsError("permission-denied", "Not allowed.");

  const { sheetId, eatBackPct } = await loadSettings(uid);
  if (!sheetId) throw new HttpsError("failed-precondition", "No Google Sheet is connected in Settings.");

  const [sessionSnap, weightSnap] = await Promise.all([
    db.collection(`users/${uid}/sessions`).where("status", "==", "finished").get(),
    db.collection(`users/${uid}/weights`).orderBy("date").get(),
  ]);
  const sessions = sessionSnap.docs
    .map((d) => ({ id: d.id, data: d.data() as SessionDoc }))
    .sort((a, b) => a.data.startedAt.toDate().getTime() - b.data.startedAt.toDate().getTime());

  try {
    const rows = await rebuildAll(getSheets(), sheetId, eatBackPct, {
      sessions: sessions.map((s) => sessionRow(s.id, s.data)),
      lifting: sessions.flatMap((s) => liftingRows(s.id, s.data)),
      swimming: sessions.flatMap((s) => swimmingRows(s.id, s.data)),
      weights: weightSnap.docs.map((d) => weightRow(d.data() as WeightDoc)),
    });
    return { rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpsError("internal", `Sheet rebuild failed: ${message}`);
  }
});
