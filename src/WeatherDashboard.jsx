/**
 * WeatherDashboard.jsx  –  ESP32 + Firebase Realtime Dashboard
 * ─────────────────────────────────────────────────────────────
 * Install (with legacy peer deps for Vite 8 compat):
 *   npm install firebase@10.12.0 framer-motion lucide-react --legacy-peer-deps
 *
 * Firebase Database Rules  (Console → Realtime Database → Rules):
 *   { "rules": { ".read": true, ".write": true } }
 *
 * ESP32 writes to  /live_data  every 5 minutes:
 *   { temperature_c, temperature_f, humidity, pressure_hpa,
 *     feels_like_c,  altitude_m,    pred_3h,  pred_6h,
 *     pred_12h,      buf_samples }
 *
 * This file writes to  /history/YYYY-MM-DD/<unix-ms>  every 3 hours.
 */

/* ─── React ──────────────────────────────────────────────────────────────── */
import {
  useState, useEffect, useRef, useMemo, useCallback,
} from "react";

/* ─── Animation ──────────────────────────────────────────────────────────── */
import { motion, AnimatePresence } from "framer-motion";

/* ─── Icons ──────────────────────────────────────────────────────────────── */
import {
  Cloud, CloudRain, CloudLightning, Sun, Wind, Droplets,
  Thermometer, Gauge, Clock, Wifi, WifiOff,
  TrendingUp, TrendingDown, Minus, Eye,
  History, X, ArrowUp, ArrowDown, RefreshCw,
} from "lucide-react";

/* ─── Firebase v9+ modular SDK ───────────────────────────────────────────── */
import { initializeApp }                          from "firebase/app";
import { getDatabase, ref, onValue, set, get }   from "firebase/database";

/* ═══════════════════════════════════════════════════════════════════════════
   FIREBASE CONFIG  ←  replace with your project values
   ═══════════════════════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "weather-e85e0.firebaseapp.com",
  databaseURL:       "https://weather-e85e0-default-rtdb.firebaseio.com",
  projectId:         "weather-e85e0",
  storageBucket:     "weather-e85e0.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

/* Initialise Firebase once at module level – safe across HMR reloads */
const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */
const THREE_HOUR_MS = 3 * 60 * 60 * 1000;

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Syne:wght@400;600;700;800&display=swap');`;

/* ═══════════════════════════════════════════════════════════════════════════
   PURE HELPERS  (defined outside component so they are never re-created)
   ═══════════════════════════════════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

function classifyCondition(pred3h) {
  const p = (pred3h ?? "").toLowerCase();
  if (p.includes("storm"))                             return "storm";
  if (p.includes("rain"))                              return "rain";
  if (p.includes("clear") || p.includes("improving")) return "clear";
  return "stable";
}

const CONDITION_META = {
  storm:  { label: "SEVERE WEATHER",    color: "#f87171", glow: "#ef4444" },
  rain:   { label: "RAINY CONDITIONS",  color: "#60a5fa", glow: "#3b82f6" },
  clear:  { label: "CLEAR SKIES",       color: "#fbbf24", glow: "#f59e0b" },
  stable: { label: "STABLE CONDITIONS", color: "#c4b5fd", glow: "#a855f7" },
};

/* ═══════════════════════════════════════════════════════════════════════════
   BACKGROUND SCENES
   ═══════════════════════════════════════════════════════════════════════════ */
function StormBackground() {
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg,#05050f 0%,#12082a 45%,#0a1520 100%)",
      }} />
      {[0, 1, 2, 3].map(i => (
        <motion.div key={i} style={{
          position: "absolute", width: 2, top: 0,
          left: `${18 + i * 20}%`, height: `${25 + i * 8}%`,
          background: "linear-gradient(180deg,transparent,#a78bfa,#fff,#a78bfa,transparent)",
          filter: "blur(1px)", transformOrigin: "top center",
        }}
          animate={{ opacity: [0, 0, 1, 0.4, 1, 0], scaleX: [1, 1.8, 0.6, 1.4, 1] }}
          transition={{ duration: 0.25, repeat: Infinity, repeatDelay: 1.8 + i * 1.4 }}
        />
      ))}
      {Array.from({ length: 55 }, (_, i) => (
        <motion.div key={i} style={{
          position: "absolute", width: 1.5,
          height: `${35 + (i % 4) * 15}px`,
          background: "linear-gradient(180deg,transparent,rgba(147,197,253,0.45))",
          left: `${(i * 1.82) % 100}%`, top: -80,
        }}
          animate={{ y: ["0vh", "115vh"] }}
          transition={{ duration: 0.55 + (i % 5) * 0.08, repeat: Infinity, delay: (i * 0.036) % 2, ease: "linear" }}
        />
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <motion.div key={i} style={{
          position: "absolute", filter: "blur(22px)", borderRadius: "50%",
          width: `${180 + i * 70}px`, height: 70,
          background: `radial-gradient(ellipse,rgba(${12 + i * 4},${8 + i * 3},${28 + i * 4},0.9) 0%,transparent 70%)`,
          top: `${i * 7}%`, left: `${-15 + i * 23}%`,
        }}
          animate={{ x: [0, 24, 0] }}
          transition={{ duration: 7 + i * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function RainBackground() {
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg,#0c1520 0%,#1a3352 55%,#0d2240 100%)",
      }} />
      {Array.from({ length: 70 }, (_, i) => (
        <motion.div key={i} style={{
          position: "absolute", width: 1.5,
          height: `${28 + (i % 4) * 18}px`,
          background: "linear-gradient(180deg,transparent,rgba(96,165,250,0.48),transparent)",
          left: `${(i * 1.43) % 100}%`, top: -55,
        }}
          animate={{ y: ["0vh", "108vh"] }}
          transition={{ duration: 0.75 + (i % 5) * 0.12, repeat: Infinity, delay: (i * 0.043) % 3, ease: "linear" }}
        />
      ))}
      {[0, 1, 2].map(i => (
        <motion.div key={i} style={{
          position: "absolute", width: "200%", height: 110,
          background: "linear-gradient(90deg,transparent,rgba(56,120,232,0.07),transparent)",
          bottom: `${8 + i * 16}%`, left: "-50%", filter: "blur(28px)",
        }}
          animate={{ x: ["0%", "50%", "0%"] }}
          transition={{ duration: 11 + i * 4, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function ClearBackground() {
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(155deg,#080f2a 0%,#14326a 35%,#0c4484 65%,#09284f 100%)",
      }} />
      <motion.div style={{
        position: "absolute", width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(251,191,36,0.28) 0%,rgba(251,146,60,0.12) 45%,transparent 70%)",
        top: "4%", right: "9%", filter: "blur(18px)",
      }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {Array.from({ length: 12 }, (_, i) => (
        <motion.div key={i} style={{
          position: "absolute", width: 2, height: `${75 + i * 9}px`,
          background: "linear-gradient(180deg,rgba(251,191,36,0.45),transparent)",
          top: "4%", right: "16%", transformOrigin: "top center",
          transform: `rotate(${i * 30}deg)`, filter: "blur(1.5px)",
        }}
          animate={{ opacity: [0.25, 0.85, 0.25] }}
          transition={{ duration: 3.2, repeat: Infinity, delay: i * 0.26, ease: "easeInOut" }}
        />
      ))}
      {Array.from({ length: 40 }, (_, i) => (
        <motion.div key={i} style={{
          position: "absolute", width: 2, height: 2, borderRadius: "50%", background: "white",
          left: `${(i * 2.22) % 82}%`, top: `${(i * 1.55) % 58}%`,
        }}
          animate={{ opacity: [0.15, 0.95, 0.15] }}
          transition={{ duration: 1.8 + (i % 4) * 0.7, repeat: Infinity, delay: (i * 0.09) % 4 }}
        />
      ))}
    </div>
  );
}

function StableBackground() {
  const clouds = [
    { w: 360, h: 78, top: "7%",  delay: 0,  dur: 22 },
    { w: 260, h: 62, top: "17%", delay: 6,  dur: 30 },
    { w: 420, h: 88, top: "29%", delay: 11, dur: 26 },
    { w: 310, h: 68, top: "4%",  delay: 17, dur: 24 },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg,#0d1c38 0%,#172a48 52%,#0c1830 100%)",
      }} />
      {clouds.map((c, i) => (
        <motion.div key={i} style={{
          position: "absolute", width: c.w, height: c.h, borderRadius: "50%",
          background: "radial-gradient(ellipse,rgba(148,163,184,0.07) 0%,transparent 70%)",
          top: c.top, left: "-20%", filter: "blur(28px)",
        }}
          animate={{ x: ["0vw", "135vw"] }}
          transition={{ duration: c.dur, repeat: Infinity, delay: c.delay, ease: "linear" }}
        />
      ))}
    </div>
  );
}

const BG_MAP = {
  storm:  StormBackground,
  rain:   RainBackground,
  clear:  ClearBackground,
  stable: StableBackground,
};

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATED NUMBER  –  slides vertically on value change
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedNumber({ value, decimals = 1 }) {
  const display = (typeof value === "number" && !isNaN(value))
    ? value.toFixed(decimals)
    : "—";
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={display}
        initial={{ y: 12,  opacity: 0 }}
        animate={{ y: 0,   opacity: 1 }}
        exit={{    y: -12, opacity: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{ display: "inline-block" }}
      >
        {display}
      </motion.span>
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARC GAUGE
   ═══════════════════════════════════════════════════════════════════════════ */
function ArcGauge({ value, min, max, color, size = 150, label, unit }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const r   = size / 2 - 14;
  const C   = Math.PI * r;
  const arc = `M 14 ${size * 0.62} A ${r} ${r} 0 0 1 ${size - 14} ${size * 0.62}`;

  return (
    <div style={{ position: "relative", width: size, height: size * 0.65, margin: "0 auto" }}>
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <path d={arc} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} strokeLinecap="round" />
        <motion.path
          d={arc} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          initial={{ strokeDashoffset: C }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: "white", fontFamily: "'Orbitron',monospace", lineHeight: 1 }}>
          <AnimatedNumber value={value} decimals={1} />
          <span style={{ fontSize: 13, opacity: 0.65, marginLeft: 2 }}>{unit}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2, letterSpacing: "0.06em" }}>{label}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREDICTION BADGE
   ═══════════════════════════════════════════════════════════════════════════ */
const PRED_CFG = {
  storm:   { bg: "rgba(239,68,68,0.14)",   border: "rgba(239,68,68,0.38)",   color: "#fca5a5", Icon: CloudLightning, glow: "#ef4444" },
  rain:    { bg: "rgba(59,130,246,0.14)",  border: "rgba(59,130,246,0.38)",  color: "#93c5fd", Icon: CloudRain,      glow: "#3b82f6" },
  clear:   { bg: "rgba(34,197,94,0.14)",   border: "rgba(34,197,94,0.38)",   color: "#86efac", Icon: Sun,            glow: "#22c55e" },
  stable:  { bg: "rgba(168,85,247,0.11)",  border: "rgba(168,85,247,0.34)",  color: "#c4b5fd", Icon: Cloud,          glow: "#a855f7" },
  collect: { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.28)", color: "#94a3b8", Icon: Clock,          glow: "#64748b" },
};

function PredBadge({ label, pred, delay = 0 }) {
  const p   = (pred ?? "").toLowerCase();
  const key =
    p.includes("storm")                            ? "storm"
    : p.includes("rain")                           ? "rain"
    : p.includes("clear") || p.includes("impr")   ? "clear"
    : p.includes("collect")                        ? "collect"
    : "stable";

  const { bg, border, color, Icon, glow } = PRED_CFG[key];

  const iconAnim =
    key === "storm"  ? { animate: { rotate: [-4, 4, -4] }, transition: { duration: 1.8, repeat: Infinity } }
    : key === "rain" ? { animate: { y: [0, -3, 0] },       transition: { duration: 2,   repeat: Infinity } }
    : key === "clear"? { animate: { rotate: [0, 360] },    transition: { duration: 10,  repeat: Infinity, ease: "linear" } }
    : {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      style={{
        background: bg, border: `1px solid ${border}`, borderRadius: 14,
        padding: "16px 12px", textAlign: "center", backdropFilter: "blur(12px)",
        boxShadow: `0 0 18px ${glow}25, inset 0 1px 0 rgba(255,255,255,0.05)`,
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: "12%", right: "12%", height: 1,
        background: `linear-gradient(90deg,transparent,${border},transparent)`,
      }} />
      <motion.div style={{ marginBottom: 7 }} {...iconAnim}>
        <Icon size={24} style={{ color, filter: `drop-shadow(0 0 5px ${glow})`, margin: "0 auto", display: "block" }} />
      </motion.div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 11, color, fontWeight: 600, lineHeight: 1.35 }}>{pred ?? "—"}</div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   METRIC CARD
   ═══════════════════════════════════════════════════════════════════════════ */
function MetricCard({ icon: Icon, label, value, unit, sub, color, delay = 0, pulse = false, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, delay }}
      style={{
        background: "rgba(255,255,255,0.038)", border: "1px solid rgba(255,255,255,0.075)",
        borderRadius: 16, padding: "18px 16px", backdropFilter: "blur(16px)",
        boxShadow: "0 4px 22px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.055)",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg,transparent,${color}50,transparent)` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <motion.div animate={pulse ? { scale: [1, 1.18, 1] } : {}} transition={{ duration: 2, repeat: Infinity }}>
          <Icon size={16} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
        </motion.div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
      </div>
      {children ?? (
        <div style={{ fontSize: 30, fontWeight: 800, color: "white", fontFamily: "'Orbitron',monospace", lineHeight: 1 }}>
          <AnimatedNumber value={typeof value === "number" ? value : NaN} decimals={1} />
          {unit && <span style={{ fontSize: 13, opacity: 0.6, marginLeft: 3 }}>{unit}</span>}
        </div>
      )}
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 5 }}>{sub}</div>}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TIME-AGO  –  reformats elapsed time every 5 s  (NOT a mock data generator)
   ═══════════════════════════════════════════════════════════════════════════ */
function TimeAgo({ ts, isPulsing }) {
  const [ago, setAgo] = useState("just now");

  useEffect(() => {
    const tick = () => {
      const s = Math.floor((Date.now() - ts) / 1000);
      setAgo(s < 10 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [ts]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <motion.div
        animate={isPulsing ? { scale: [1, 1.5, 1], opacity: [1, 0.3, 1] } : {}}
        transition={{ duration: 0.5 }}
        style={{
          width: 7, height: 7, borderRadius: "50%", background: "#22c55e",
          boxShadow: isPulsing ? "0 0 10px #4ade80" : "0 0 4px #22c55e",
        }}
      />
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Updated {ago}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORY PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function HistoryPanel({ isOpen, onClose, historyData, isLoading }) {
  const grouped = useMemo(() => {
    if (!historyData) return [];
    return Object.entries(historyData)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({
        date,
        records: Object.entries(entries)
          .sort(([a], [b]) => Number(b) - Number(a))
          .slice(0, 8)
          .map(([ts, data]) => ({ ts, ...data })),
      }));
  }, [historyData]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="hbd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          />

          <motion.div
            key="hpn"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 38 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50,
              width: Math.min(420, window.innerWidth - 32),
              background: "linear-gradient(180deg,rgba(12,18,40,0.98),rgba(8,14,30,0.99))",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "20px 20px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#a78bfa", textTransform: "uppercase", marginBottom: 4 }}>Weather Archive</div>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Orbitron',monospace" }}>History Log</div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, width: 34, height: 34,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "white",
                }}
              >
                <X size={15} />
              </motion.button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
              {isLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: "rgba(255,255,255,0.35)" }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
                    <RefreshCw size={18} />
                  </motion.div>
                  <span style={{ fontSize: 13, fontFamily: "'Syne',sans-serif" }}>Loading archive…</span>
                </div>
              ) : grouped.length === 0 ? (
                <div style={{ textAlign: "center", paddingTop: 60, color: "rgba(255,255,255,0.28)", fontSize: 13, fontFamily: "'Syne',sans-serif" }}>
                  No history recorded yet.<br />
                  <span style={{ fontSize: 11, opacity: 0.6 }}>First snapshot saves after 3 hours of uptime.</span>
                </div>
              ) : grouped.map(({ date, records }) => (
                <div key={date} style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 9, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {date}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {records.map(({ ts, temperature_c, humidity, pressure_hpa, condition, pred_3h }) => {
                      const cond = condition ?? classifyCondition(pred_3h);
                      const cc   = CONDITION_META[cond]?.color ?? "#c4b5fd";
                      const time = new Date(Number(ts)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      return (
                        <motion.div
                          key={ts}
                          initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25 }}
                          style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${cc}22`, borderLeft: `3px solid ${cc}`, borderRadius: 9, padding: "9px 12px" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "'Orbitron',monospace" }}>{time}</span>
                            <span style={{ fontSize: 9, color: cc, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                              {CONDITION_META[cond]?.label ?? cond}
                            </span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}>
                            {[
                              { l: "Temp",  v: `${temperature_c?.toFixed(1)}°C` },
                              { l: "Humid", v: `${humidity?.toFixed(0)}%` },
                              { l: "Press", v: `${pressure_hpa?.toFixed(0)} hPa` },
                            ].map(({ l, v }) => (
                              <div key={l} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>{l}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Orbitron',monospace", color: "white" }}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONNECTING SCREEN
   ═══════════════════════════════════════════════════════════════════════════ */
function ConnectingScreen() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShowHint(true), 8000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(180deg,#0a0f20,#0d1530)", gap: 20,
    }}>
      <style>{FONTS}</style>

      {/* Pulsing wifi ring */}
      <div style={{ position: "relative", width: 64, height: 64 }}>
        <motion.div
          animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid #60a5fa" }}
        />
        <div style={{
          position: "absolute", inset: 8, borderRadius: "50%",
          background: "rgba(96,165,250,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Wifi size={22} style={{ color: "#60a5fa" }} />
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ fontSize: 13, letterSpacing: "0.22em", color: "rgba(255,255,255,0.6)", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}
        >
          CONNECTING TO STATION…
        </motion.div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", fontFamily: "'Syne',sans-serif" }}>
          Firebase · /live_data · awaiting ESP32
        </div>
      </div>

      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{
              maxWidth: 320, textAlign: "center", padding: "14px 20px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, fontSize: 11, color: "rgba(255,255,255,0.35)",
              fontFamily: "'Syne',sans-serif", lineHeight: 1.8,
            }}
          >
            Still waiting? Check:<br />
            <span style={{ color: "rgba(255,255,255,0.55)" }}>
              1. Firebase rules → <code style={{ fontSize: 10 }}>.read: true</code><br />
              2. Correct <code style={{ fontSize: 10 }}>databaseURL</code> in config<br />
              3. ESP32 is powered and on Wi-Fi<br />
              4. <code style={{ fontSize: 10 }}>/live_data</code> node exists in Console
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function WeatherDashboard() {

  /* ── state ──────────────────────────────────────────────────────────────── */
  const [weather,     setWeather]     = useState(null);   // null → ConnectingScreen
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isPulsing,   setIsPulsing]   = useState(false);
  const [connected,   setConnected]   = useState(false);
  const [todayHigh,   setTodayHigh]   = useState(null);
  const [todayLow,    setTodayLow]    = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [histLoading, setHistLoading] = useState(false);

  /* ── refs ───────────────────────────────────────────────────────────────── */
  const dateKeyRef     = useRef(todayStr());  // tracks calendar day for High/Low reset
  const lastHistoryRef = useRef(0);           // ms of last /history write

  /* ── processIncoming ────────────────────────────────────────────────────── */
  const processIncoming = useCallback((d) => {
    /* 1. Update UI */
    setWeather(d);
    setConnected(true);
    setLastUpdated(Date.now());
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 1000);

    /* 2. Today High / Low  –  recalculated on every incoming reading.
          The ESP32 writes every 5 minutes, so this effectively refreshes
          every 5 minutes. Resets at midnight automatically. */
    const today = todayStr();
    if (dateKeyRef.current !== today) {
      dateKeyRef.current = today;
      setTodayHigh(d.temperature_c);
      setTodayLow(d.temperature_c);
    } else {
      setTodayHigh(prev => prev === null ? d.temperature_c : Math.max(prev, d.temperature_c));
      setTodayLow( prev => prev === null ? d.temperature_c : Math.min(prev, d.temperature_c));
    }

    /* 3. Write /history snapshot every 3 hours */
    const now = Date.now();
    if (now - lastHistoryRef.current >= THREE_HOUR_MS) {
      lastHistoryRef.current = now;
      set(
        ref(db, `history/${todayStr()}/${now}`),
        { ...d, condition: classifyCondition(d.pred_3h) }
      ).catch(err => console.error("[Firebase] history write:", err.code, err.message));
    }
  }, []); // empty deps — all setters and db are stable references

  /* ── Firebase real-time listener on /live_data ──────────────────────────── */
  useEffect(() => {
    const liveRef     = ref(db, "live_data");
    const unsubscribe = onValue(
      liveRef,
      (snapshot) => {
        const d = snapshot.val();
        if (d) processIncoming(d);
        else   setConnected(true); // connected but node is empty
      },
      (error) => {
        console.error("[Firebase] onValue error:", error.code, error.message);
        setConnected(false);
      },
    );
    return () => unsubscribe(); // detach on unmount
  }, [processIncoming]);

  /* ── History panel – one-time fetch ─────────────────────────────────────── */
  const openHistory = useCallback(async () => {
    setShowHistory(true);
    if (historyData !== null) return;
    setHistLoading(true);
    try {
      const snap = await get(ref(db, "history"));
      setHistoryData(snap.val() ?? {});
    } catch (err) {
      console.error("[Firebase] history fetch:", err.code, err.message);
      setHistoryData({});
    } finally {
      setHistLoading(false);
    }
  }, [historyData]);

  /* ── Condition: only recomputes when pred_3h changes ────────────────────── *
   * Temperature / humidity / pressure updates do NOT retrigger background.    */
  const condition  = useMemo(() => classifyCondition(weather?.pred_3h), [weather?.pred_3h]);
  const meta       = CONDITION_META[condition];
  const Background = BG_MAP[condition];
  const MainIcon   =
    condition === "storm" ? CloudLightning
    : condition === "rain"  ? CloudRain
    : condition === "clear" ? Sun
    : Cloud;

  /* ── Show connecting screen until first real Firebase value ─────────────── */
  if (!weather) return <ConnectingScreen />;

  /* ── Dashboard ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Syne',sans-serif", color: "white", position: "relative" }}>
      <style>{`
        ${FONTS}
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.09); border-radius: 2px; }
      `}</style>

      {/* Background: key=condition so it only swaps when prediction CLASS changes */}
      <AnimatePresence mode="wait">
        <motion.div key={condition}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 1.8 }}>
          <Background />
        </motion.div>
      </AnimatePresence>

      {/* Film-grain overlay */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.028'/%3E%3C/svg%3E")`,
        backgroundSize: "200px 200px",
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, maxWidth: 920, margin: "0 auto", padding: "22px 18px 44px" }}>

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}
        >
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.26em", color: meta.color, textTransform: "uppercase", marginBottom: 5, textShadow: `0 0 18px ${meta.color}` }}>
              ESP32 · BME280 · JAMSAR STATION
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Orbitron',monospace" }}>Jamsar Station</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>Bikaner, Rajasthan · 210 m ASL</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.04, background: `${meta.color}18` }}
              whileTap={{ scale: 0.96 }}
              onClick={openHistory}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "rgba(255,255,255,0.05)", border: `1px solid ${meta.color}40`,
                borderRadius: 8, padding: "7px 13px", color: "white", cursor: "pointer",
                fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
              }}
            >
              <History size={14} style={{ color: meta.color }} />
              HISTORY
            </motion.button>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {connected
                ? <Wifi    size={13} style={{ color: "#4ade80" }} />
                : <WifiOff size={13} style={{ color: "#f87171" }} />}
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em" }}>
                {connected ? "LIVE" : "OFFLINE"}
              </span>
            </div>

            {lastUpdated !== null && <TimeAgo ts={lastUpdated} isPulsing={isPulsing} />}

            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
              {weather.buf_samples} pressure samples
            </div>
          </div>
        </motion.div>

        {/* ── HERO CARD ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.08 }}
          style={{
            background: `linear-gradient(135deg,${meta.color}0e,rgba(255,255,255,0.025))`,
            border: `1px solid ${meta.color}2a`, borderRadius: 22,
            padding: "24px 26px 20px", marginBottom: 18, backdropFilter: "blur(22px)",
            boxShadow: `0 0 55px ${meta.color}12, 0 4px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.065)`,
            position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200,
            background: `radial-gradient(circle at top right,${meta.color}10,transparent 62%)`, pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            {/* Icon + condition label */}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <motion.div
                animate={
                  condition === "storm" ? { rotate: [-5, 5, -5], scale: [1, 1.06, 1] }
                  : condition === "clear"? { rotate: [0, 360] }
                  : condition === "rain" ? { y: [0, -5, 0] }
                  : { scale: [1, 1.04, 1] }
                }
                transition={
                  condition === "clear"
                    ? { duration: 12, repeat: Infinity, ease: "linear" }
                    : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
                }
              >
                <MainIcon size={52} style={{ color: meta.color, filter: `drop-shadow(0 0 14px ${meta.color})` }} />
              </motion.div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.38)", marginBottom: 3 }}>CURRENT CONDITION</div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Orbitron',monospace", color: meta.color, textShadow: `0 0 28px ${meta.color}70` }}>
                  {meta.label}
                </div>
              </div>
            </div>

            {/* Temperature */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 66, fontWeight: 900, fontFamily: "'Orbitron',monospace", lineHeight: 1, color: "white", textShadow: "0 0 36px rgba(255,255,255,0.25)" }}>
                <AnimatedNumber value={weather.temperature_c} decimals={1} />
                <span style={{ fontSize: 26, opacity: 0.55 }}>°C</span>
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.42)", marginTop: 1 }}>
                <AnimatedNumber value={weather.temperature_f} decimals={1} />°F
              </div>
            </div>
          </div>

          {/* High / Low strip */}
          <div style={{ display: "flex", gap: 24, marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              { Icon: ArrowUp,   val: todayHigh, label: "Today's High", tc: "#f87171", vc: "#fca5a5" },
              { Icon: ArrowDown, val: todayLow,  label: "Today's Low",  tc: "#60a5fa", vc: "#93c5fd" },
            ].map(({ Icon, val, label, tc, vc }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Icon size={13} style={{ color: tc }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Orbitron',monospace", color: vc }}>
                  <AnimatedNumber value={val} decimals={1} />°
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── GAUGES ──────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          {[
            { Icon: Droplets, color: "#60a5fa", label: "Humidity", value: weather.humidity,     min: 0,   max: 100,  unit: "%",   gLabel: "Relative Humidity" },
            { Icon: Gauge,    color: "#a78bfa", label: "Pressure", value: weather.pressure_hpa, min: 980, max: 1040, unit: "hPa", gLabel: "Atm. Pressure"     },
          ].map((g, i) => (
            <motion.div key={g.label}
              initial={{ opacity: 0, x: i === 0 ? -20 : 20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18 }}
              style={{ background: "rgba(255,255,255,0.036)", border: "1px solid rgba(255,255,255,0.072)", borderRadius: 18, padding: "18px 14px 14px", backdropFilter: "blur(16px)", boxShadow: "0 4px 22px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)", textAlign: "center" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 10 }}>
                <g.Icon size={14} style={{ color: g.color }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{g.label}</span>
              </div>
              <ArcGauge value={g.value} min={g.min} max={g.max} color={g.color} label={g.gLabel} unit={g.unit} size={150} />
            </motion.div>
          ))}
        </div>

        {/* ── METRIC CARDS ────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <MetricCard icon={Thermometer} label="Feels Like"
            value={weather.feels_like_c} unit="°C" color="#fb923c"
            delay={0.28} pulse={weather.feels_like_c > 30}
            sub={weather.feels_like_c > 40 ? "⚠ Extreme Heat" : weather.feels_like_c > 30 ? "⚠ High Heat" : "Comfortable"} />

          <MetricCard icon={Eye} label="Altitude"
            value={weather.altitude_m} unit="m" color="#34d399"
            delay={0.33} sub="Above sea level" />

          <MetricCard icon={Wind} label="Tendency" color="#f472b6" delay={0.38}
            sub={weather.pred_3h?.split(" ").slice(0, 2).join(" ")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              {(() => {
                const p = (weather.pred_3h ?? "").toLowerCase();
                return p.includes("storm") || p.includes("rain")
                  ? <TrendingDown size={18} style={{ color: "#f87171" }} />
                  : p.includes("improving") || p.includes("clear")
                  ? <TrendingUp   size={18} style={{ color: "#4ade80" }} />
                  : <Minus        size={18} style={{ color: "#94a3b8" }} />;
              })()}
              <span style={{ fontSize: 28, fontWeight: 800, color: "white", fontFamily: "'Orbitron',monospace", lineHeight: 1 }}>
                <AnimatedNumber value={weather.pressure_hpa} decimals={0} />
              </span>
              <span style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>hPa</span>
            </div>
          </MetricCard>
        </div>

        {/* ── FORECAST GRID ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 18, padding: "18px 18px 16px", backdropFilter: "blur(12px)" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Clock size={13} style={{ color: "rgba(255,255,255,0.38)" }} />
            <span style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.38)", textTransform: "uppercase" }}>
              Multi-Window Forecast
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.055)", marginLeft: 4 }} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>
              Pressure Tendency · 144-sample ring buffer
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <PredBadge label="3 Hours"  pred={weather.pred_3h}  delay={0.48} />
            <PredBadge label="6 Hours"  pred={weather.pred_6h}  delay={0.56} />
            <PredBadge label="12 Hours" pred={weather.pred_12h} delay={0.64} />
          </div>
        </motion.div>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderTop: "1px solid rgba(255,255,255,0.045)" }}
        >
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.1em" }}>
            BME280 @ 0x77 · SDA GPIO21 · SCL GPIO22 · Jamsar, Bikaner
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.08em" }}>
            FIREBASE RTDB · 5-MIN REFRESH · 3-HR HISTORY SNAPSHOT
          </span>
        </motion.div>
      </div>

      {/* History drawer */}
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        historyData={historyData}
        isLoading={histLoading}
      />
    </div>
  );
}
