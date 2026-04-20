import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js"; // Thêm Auth

const firebaseConfig = {
  apiKey: "AIzaSyCjjDjvMXF3KuHCZKgx1KtpJrQSBj_BTec",
  authDomain: "mysmarthome-13774.firebaseapp.com",
  projectId: "mysmarthome-13774",
  storageBucket: "mysmarthome-13774.firebasestorage.app",
  messagingSenderId: "632584699477",
  appId: "1:632584699477:web:7ead0c8f1db1c2ffba1edc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); 