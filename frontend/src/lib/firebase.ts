/**
 * Firebase init — single source of truth for the app/auth/db/storage handles.
 *
 * Config is public (these tokens are designed to ship to the browser); access
 * is restricted by Firestore Security Rules + Firebase Auth, not by hiding
 * them. So no .env needed for these.
 */

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDOj0o6lri8ZlHDLRII4oPiU9A625BqIk4",
  authDomain: "ig-autopilot-dad1c.firebaseapp.com",
  projectId: "ig-autopilot-dad1c",
  storageBucket: "ig-autopilot-dad1c.firebasestorage.app",
  messagingSenderId: "556766942328",
  appId: "1:556766942328:web:d6fe38611f98716c8d898d",
  measurementId: "G-8LT4FHCLKV",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
