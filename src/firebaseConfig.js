// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCtmHbl6HP_tmhsRkzKG5ucWh_AKg0iMTQ",
  databaseURL: "https://weather-e85e0-default-rtdb.firebaseio.com",
  projectId: "weather-e85e0",
  // बाकी फील्ड्स खाली छोड़ सकते हैं अगर सिर्फ RTDB यूज़ कर रहे हैं
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);