// Firebase Configuration for WishCard.in
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyDZPMrtoyLSchDuFB9pUZrQflNCDbGNHUY",
  authDomain: "wishcard-in.firebaseapp.com",
  projectId: "wishcard-in",
  storageBucket: "wishcard-in.firebasestorage.app",
  messagingSenderId: "1065655743578",
  appId: "1:1065655743578:web:77913e4fece55b0fff9463"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage, firebaseConfig };
