// Firebase SDKの読み込み（CDN）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ここに自分のFirebase設定情報を貼り付ける
const firebaseConfig = {
  apiKey: "AIzaSyBAO1p2XUMb7AyI3ZEZ_LSyd-GpKQ2Mjvo",
  authDomain: "xeno-app-a83e2.firebaseapp.com",
  projectId: "xeno-app-a83e2",
  storageBucket: "xeno-app-a83e2.firebasestorage.app",
  messagingSenderId: "705125850113",
  appId: "1:705125850113:web:5d9eaa9ef2ac922e367400"
};

// Firebaseの初期化
const app = initializeApp(firebaseConfig);

// FirestoreとAuthのエクスポート
export const db = getFirestore(app);
export const auth = getAuth(app);
export { signInAnonymously };