// firebase.js
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyDgARe7bFlrW5WIlWd0tZ4UB98FMcDbW4U",
  authDomain: "maxpot-app.firebaseapp.com",
  databaseURL: "https://maxpot-app-default-rtdb.firebaseio.com",
  projectId: "maxpot-app",
  storageBucket: "maxpot-app.firebasestorage.app",
  messagingSenderId: "1011555350965",
  appId: "1:1011555350965:web:38585cb22965e72c8f01fc",
  measurementId: "G-X5HF3LWLQG",
};

export const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const onAuthChanged = (callback) => onAuthStateChanged(auth, callback);

export async function signUpWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export function signOut() {
  return firebaseSignOut(auth);
}

const userDocRef = (uid) => doc(db, "users", uid);

export async function fetchUserData(uid) {
  const snapshot = await getDoc(userDocRef(uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserData(uid, data) {
  return setDoc(userDocRef(uid), data, { merge: true });
}
