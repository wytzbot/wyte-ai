// js/firebase-client.js
// Client-side Firebase config. This is safe to expose publicly — it's not a secret,
// access is controlled by Firestore Security Rules (see firestore.rules), not by
// hiding this object.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_seRYhFr7S9UpY3Xl8O9348Vow0eEG5M",
  authDomain: "wytetech.firebaseapp.com",
  projectId: "wytetech",
  storageBucket: "wytetech.firebasestorage.app",
  messagingSenderId: "418066704491",
  appId: "1:418066704491:web:e436fd749fec1b6ad3e92e",
  measurementId: "G-8L4LGB2X7F",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  getDocs,
};
