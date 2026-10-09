import { collection, doc } from "firebase/firestore";
import { db } from "../firebase";

export const userDoc = (uid: string) => doc(db, "users", uid);
export const sessionsCol = (uid: string) => collection(db, "users", uid, "sessions");
export const sessionDoc = (uid: string, id: string) => doc(db, "users", uid, "sessions", id);
export const locationsCol = (uid: string) => collection(db, "users", uid, "locations");
export const locationDoc = (uid: string, id: string) => doc(db, "users", uid, "locations", id);
export const exercisesCol = (uid: string) => collection(db, "users", uid, "exercises");
export const exerciseDoc = (uid: string, id: string) => doc(db, "users", uid, "exercises", id);
export const weightsCol = (uid: string) => collection(db, "users", uid, "weights");
export const weightDoc = (uid: string, date: string) => doc(db, "users", uid, "weights", date);
