// src/firebase.js
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIza....",               // Lấy từ Firebase Console
  authDomain: "yourapp.firebaseapp.com",
  projectId: "yourapp",
  storageBucket: "yourapp.appspot.com",
  messagingSenderId: "....",
  appId: "1:...:web:..."
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
