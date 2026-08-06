// lib/firebaseAdmin.js
//
// Server-side Firebase Admin SDK. Never import this in frontend code.
// Requires env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// (Get these from Firebase Console -> Project Settings -> Service Accounts -> Generate new private key)

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars store \n as literal characters — convert back to real newlines
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
