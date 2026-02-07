import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQZoxMet9-ofebXS06Wrr6LUTqnfKseZ8",
  authDomain: "riventhra1.firebaseapp.com",
  databaseURL: "https://riventhra1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "riventhra1",
  storageBucket: "riventhra1.firebasestorage.app",
  messagingSenderId: "74950816578",
  appId: "1:74950816578:web:be7312b1569471398c4edb",
  measurementId: "G-SP7VBPH4Z9"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };
