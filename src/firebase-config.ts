// Public by design: access is enforced by Auth + Firestore rules (see firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyCiEolQDwHPseJAGqb3gwfO-Ah2ujfN0BI",
  authDomain: "log-it-suji.firebaseapp.com",
  projectId: "log-it-suji",
  storageBucket: "log-it-suji.firebasestorage.app",
  messagingSenderId: "458750669567",
  appId: "1:458750669567:web:2a6b33c6bd5f9825a792ca",
};

// Single-user allowlist (client-side UX check; the real enforcement is in firestore.rules).
export const ALLOWED_EMAIL = "fsyedhuq@uci.edu";
