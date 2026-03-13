/**
 * WeatherDashboard.jsx — v3 (Live Firebase Production)
 *
 * Setup:
 *   npm install firebase framer-motion lucide-react
 *
 * ⚠️  Replace FIREBASE_CONFIG values below with your project's credentials.
 *     Rotate your API key at: console.cloud.google.com → APIs & Services → Credentials
 *
 * Firebase RTDB structure (written by ESP32):
 *   /live_data   → { temperature_c, temperature_f, humidity, pressure_hpa,
 *                    feels_like_c, altitude_m, pred_3h, pred_6h, pred_12h,
 *                    buf_samples }
 *   /history     → { "YYYY-MM-DD": { "<ms-timestamp>": { ...same fields + condition } } }
 *
 * Architecture:
 *   • onValue() real-time listener — UI updates the instant ESP32 writes
 *   • useMemo([pred_3h]) — background animation locked to 3h forecast only
 *   • 3-hour history snapshot written via set() inside processIncoming()
 *   • High/Low resets at midnight via dateKeyRef
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud, CloudRain, CloudLightning, Sun, Wind, Droplets,
  Thermometer, Gauge, Clock, Wifi, WifiOff, TrendingUp,
  TrendingDown, Minus, Eye, History, X,
  ArrowUp, ArrowDown, RefreshCw
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
//  FIREBASE — live production configuration
// ═══════════════════════════════════════════════════════════════════════════════
import { initializeApp }     from "firebase/app";
import { getDatabase, ref,
         onValue, set, get } from "firebase/database";

const FIREBASE_CONFIG = {
  apiKey:      "YOUR_ROTATED_API_KEY",        // ⚠️ replace with rotated key
  databaseURL: "https://weather-e85e0-default-rtdb.firebaseio.com",
};

const app      = initializeApp(FIREBASE_CONFIG);
const database = getDatabase(app);

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const THREE_HOUR_MS = 3 * 60 * 60 * 1000;
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Syne:wght@400;600;700;800&display=swap');`;

// ═══════════════════════════════════════════════════════════════════════════════
//  PURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Classify condition from pred_3h string. Memoised at call site. */
function classifyCondition(pred3h) {
  const p = (pred3h || "").toLowerCase();
  if (p.includes("storm"))                        return "storm";
  if (p.includes("high rain") || p.includes("rain")) return "rain";
  if (p.includes("clear") || p.includes("improving")) return "clear";
  return "stable";
}

const CONDITION_META = {
  storm:  { label: "SEVERE WEATHER",     color: "#f87171", glow: "#ef444488" },
  rain:   { label: "RAINY CONDITIONS",   color: "#60a5fa", glow: "#3b82f688" },
  clear:  { label: "CLEAR SKIES",        color: "#fbbf24", glow: "#f59e0b88" },
  stable: { label: "STABLE CONDITIONS",  color: "#c4b5fd", glow: "#a855f788" },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ANIMATED BACKGROUNDS  (locked to condition, not every render)
// ═══════════════════════════════════════════════════════════════════════════════

function StormBackground() {
  return (
    <div style={{ position:"fixed", inset:0, overflow:"hidden", zIndex:0 }}>
      <div style={{ position:"absolute", inset:0,
        background:"linear-gradient(180deg,#05050f 0%,#12082a 45%,#0a1520 100%)" }} />
      {/* Lightning bolts */}
      {[0,1,2,3].map(i => (
        <motion.div key={i} style={{
          position:"absolute", width:2, top:0,
          left:`${18+i*20}%`, height:`${25+i*8}%`,
          background:"linear-gradient(180deg,transparent,#a78bfa,#fff,#a78bfa,transparent)",
          filter:"blur(1px)", transformOrigin:"top center",
        }}
          animate={{ opacity:[0,0,1,0.4,1,0], scaleX:[1,1.8,0.6,1.4,1] }}
          transition={{ duration:0.25, repeat:Infinity, repeatDelay:1.8+i*1.4 }}
        />
      ))}
      {/* Rain */}
      {Array.from({length:60},(_,i) => (
        <motion.div key={i} style={{
          position:"absolute", width:1.5,
          height:`${35+i%4*15}px`,
          background:"linear-gradient(180deg,transparent,rgba(147,197,253,0.45))",
          left:`${(i*1.67)%100}%`, top:-80,
        }}
          animate={{ y:["0vh","115vh"] }}
          transition={{ duration:0.55+(i%5)*0.08, repeat:Infinity, delay:(i*0.033)%2, ease:"linear" }}
        />
      ))}
      {/* Cloud blobs */}
      {[0,1,2,3,4].map(i => (
        <motion.div key={i} style={{
          position:"absolute", filter:"blur(22px)", borderRadius:"50%",
          width:`${180+i*70}px`, height:70,
          background:`radial-gradient(ellipse,rgba(${12+i*4},${8+i*3},${28+i*4},0.92) 0%,transparent 70%)`,
          top:`${i*7}%`, left:`${-15+i*23}%`,
        }}
          animate={{ x:[0,24,0] }}
          transition={{ duration:7+i*2, repeat:Infinity, ease:"easeInOut" }}
        />
      ))}
    </div>
  );
}

function RainBackground() {
  return (
    <div style={{ position:"fixed", inset:0, overflow:"hidden", zIndex:0 }}>
      <div style={{ position:"absolute", inset:0,
        background:"linear-gradient(180deg,#0c1520 0%,#1a3352 55%,#0d2240 100%)" }} />
      {Array.from({length:75},(_,i) => (
        <motion.div key={i} style={{
          position:"absolute", width:1.5,
          height:`${28+(i%4)*18}px`,
          background:"linear-gradient(180deg,transparent,rgba(96,165,250,0.48),transparent)",
          left:`${(i*1.34)%100}%`, top:-55,
        }}
          animate={{ y:["0vh","108vh"] }}
          transition={{ duration:0.75+(i%5)*0.12, repeat:Infinity, delay:(i*0.04)%3, ease:"linear" }}
        />
      ))}
      {[0,1,2].map(i => (
        <motion.div key={i} style={{
          position:"absolute", width:"200%", height:110,
          background:"linear-gradient(90deg,transparent,rgba(56,120,232,0.07),transparent)",
          bottom:`${8+i*16}%`, left:"-50%", filter:"blur(28px)",
        }}
          animate={{ x:["0%","50%","0%"] }}
          transition={{ duration:11+i*4, repeat:Infinity, ease:"easeInOut" }}
        />
      ))}
    </div>
  );
}

function ClearBackground() {
  return (
    <div style={{ position:"fixed", inset:0, overflow:"hidden", zIndex:0 }}>
      <div style={{ position:"absolute", inset:0,
        background:"linear-gradient(155deg,#080f2a 0%,#14326a 35%,#0c4484 65%,#09284f 100%)" }} />
      <motion.div style={{
        position:"absolute", width:280, height:280, borderRadius:"50%",
        background:"radial-gradient(circle,rgba(251,191,36,0.28) 0%,rgba(251,146,60,0.12) 45%,transparent 70%)",
        top:"4%", right:"9%", filter:"blur(18px)",
      }}
        animate={{ scale:[1,1.18,1], opacity:[0.65,1,0.65] }}
        transition={{ duration:4.5, repeat:Infinity, ease:"easeInOut" }}
      />
      {Array.from({length:12},(_,i) => (
        <motion.div key={i} style={{
          position:"absolute", width:2,
          height:`${75+i*9}px`,
          background:"linear-gradient(180deg,rgba(251,191,36,0.45),transparent)",
          top:"4%", right:"16%",
          transformOrigin:"top center",
          transform:`rotate(${i*30}deg)`,
          filter:"blur(1.5px)",
        }}
          animate={{ opacity:[0.25,0.85,0.25] }}
          transition={{ duration:3.2, repeat:Infinity, delay:i*0.26, ease:"easeInOut" }}
        />
      ))}
      {Array.from({length:45},(_,i) => (
        <motion.div key={i} style={{
          position:"absolute", width:2, height:2, borderRadius:"50%", background:"white",
          left:`${(i*2.22)%82}%`, top:`${(i*1.55)%58}%`,
        }}
          animate={{ opacity:[0.15,0.95,0.15] }}
          transition={{ duration:1.8+(i%4)*0.7, repeat:Infinity, delay:(i*0.09)%4 }}
        />
      ))}
    </div>
  );
}

function StableBackground() {
  const clouds = [
    {w:360,h:78,top:"7%",delay:0,dur:22},
    {w:260,h:62,top:"17%",delay:6,dur:30},
    {w:420,h:88,top:"29%",delay:11,dur:26},
    {w:310,h:68,top:"4%",delay:17,dur:24},
  ];
  return (
    <div style={{ position:"fixed", inset:0, overflow:"hidden", zIndex:0 }}>
      <div style={{ position:"absolute", inset:0,
        background:"linear-gradient(180deg,#0d1c38 0%,#172a48 52%,#0c1830 100%)" }} />
      {clouds.map((c,i) => (
        <motion.div key={i} style={{
          position:"absolute", width:c.w, height:c.h, borderRadius:"50%",
          background:"radial-gradient(ellipse,rgba(148,163,184,0.07) 0%,transparent 70%)",
          top:c.top, left:"-20%", filter:"blur(28px)",
        }}
          animate={{ x:["0vw","135vw"] }}
          transition={{ duration:c.dur, repeat:Infinity, delay:c.delay, ease:"linear" }}
        />
      ))}
    </div>
  );
}

const BG_MAP = { storm:StormBackground, rain:RainBackground, clear:ClearBackground, stable:StableBackground };

// ═══════════════════════════════════════════════════════════════════════════════
//  ANIMATED NUMBER — slides up/down on change
// ═══════════════════════════════════════════════════════════════════════════════
function AnimatedNumber({ value, decimals = 1, style = {} }) {
  const display = typeof value === "number" ? value.toFixed(decimals) : "—";
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={display}
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -14, opacity: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ display: "inline-block", ...style }}
      >
        {display}
      </motion.span>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ARC GAUGE
// ═══════════════════════════════════════════════════════════════════════════════
function ArcGauge({ value, min, max, color, size = 150, label, unit }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const r   = size / 2 - 14;
  const C   = Math.PI * r;
  return (
    <div style={{ position:"relative", width:size, height:size*0.65, margin:"0 auto" }}>
      <svg width={size} height={size*0.65} viewBox={`0 0 ${size} ${size*0.65}`}>
        <path d={`M 14 ${size*0.62} A ${r} ${r} 0 0 1 ${size-14} ${size*0.62}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} strokeLinecap="round" />
        <motion.path d={`M 14 ${size*0.62} A ${r} ${r} 0 0 1 ${size-14} ${size*0.62}`}
          fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          initial={{ strokeDashoffset: C }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          style={{ filter:`drop-shadow(0 0 5px ${color})` }}
        />
      </svg>
      <div style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)", textAlign:"center" }}>
        <div style={{ fontSize:26, fontWeight:700, color:"white", fontFamily:"'Orbitron',monospace", lineHeight:1 }}>
          <AnimatedNumber value={value} decimals={1} />
          <span style={{ fontSize:13, opacity:0.65, marginLeft:2 }}>{unit}</span>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginTop:2, letterSpacing:"0.06em" }}>{label}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PREDICTION BADGE
// ═══════════════════════════════════════════════════════════════════════════════
const PRED_CFG = {
  storm:   { bg:"rgba(239,68,68,0.14)",   border:"rgba(239,68,68,0.38)",   color:"#fca5a5", Icon:CloudLightning, glow:"#ef4444" },
  rain:    { bg:"rgba(59,130,246,0.14)",  border:"rgba(59,130,246,0.38)",  color:"#93c5fd", Icon:CloudRain,       glow:"#3b82f6" },
  clear:   { bg:"rgba(34,197,94,0.14)",   border:"rgba(34,197,94,0.38)",   color:"#86efac", Icon:Sun,             glow:"#22c55e" },
  stable:  { bg:"rgba(168,85,247,0.11)",  border:"rgba(168,85,247,0.34)",  color:"#c4b5fd", Icon:Cloud,           glow:"#a855f7" },
  collect: { bg:"rgba(100,116,139,0.12)", border:"rgba(100,116,139,0.28)", color:"#94a3b8", Icon:Clock,           glow:"#64748b" },
};

function PredBadge({ label, pred, delay = 0 }) {
  const p = (pred || "").toLowerCase();
  const key = p.includes("storm") ? "storm"
    : (p.includes("high rain") || p.includes("rain")) ? "rain"
    : (p.includes("clear") || p.includes("improving")) ? "clear"
    : p.includes("collect") ? "collect"
    : "stable";
  const { bg, border, color, Icon, glow } = PRED_CFG[key];
  const animProps = key === "storm"  ? { animate:{rotate:[-4,4,-4]}, transition:{duration:1.8,repeat:Infinity} }
    : key === "rain"   ? { animate:{y:[0,-3,0]},     transition:{duration:2,repeat:Infinity} }
    : key === "clear"  ? { animate:{rotate:[0,360]},  transition:{duration:10,repeat:Infinity,ease:"linear"} }
    : {};
  return (
    <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:0.55,delay}}
      style={{ background:bg, border:`1px solid ${border}`, borderRadius:14, padding:"16px 12px",
        textAlign:"center", backdropFilter:"blur(12px)",
        boxShadow:`0 0 18px ${glow}20,inset 0 1px 0 rgba(255,255,255,0.05)`,
        position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:"12%", right:"12%", height:1,
        background:`linear-gradient(90deg,transparent,${border},transparent)` }} />
      <motion.div style={{marginBottom:7}} {...animProps}>
        <Icon size={24} style={{color, filter:`drop-shadow(0 0 5px ${glow})`, margin:"0 auto", display:"block"}} />
      </motion.div>
      <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:"0.14em",
        textTransform:"uppercase", marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:11, color, fontWeight:600, lineHeight:1.35 }}>{pred || "—"}</div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  METRIC CARD
// ═══════════════════════════════════════════════════════════════════════════════
function MetricCard({ icon:Icon, label, value, unit, sub, color, delay=0, pulse=false, children }) {
  return (
    <motion.div initial={{opacity:0,scale:0.93}} animate={{opacity:1,scale:1}} transition={{duration:0.45,delay}}
      style={{ background:"rgba(255,255,255,0.038)", border:"1px solid rgba(255,255,255,0.075)",
        borderRadius:16, padding:"18px 16px", backdropFilter:"blur(16px)",
        boxShadow:"0 4px 22px rgba(0,0,0,0.32),inset 0 1px 0 rgba(255,255,255,0.055)",
        position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1,
        background:`linear-gradient(90deg,transparent,${color}50,transparent)` }} />
      <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:10 }}>
        <motion.div animate={pulse?{scale:[1,1.18,1]}:{}} transition={{duration:2,repeat:Infinity}}>
          <Icon size={16} style={{color, filter:`drop-shadow(0 0 4px ${color})`}} />
        </motion.div>
        <span style={{ fontSize:10, color:"rgba(255,255,255,0.42)", textTransform:"uppercase", letterSpacing:"0.1em" }}>
          {label}
        </span>
      </div>
      {children || (
        <div style={{ fontSize:30, fontWeight:800, color:"white", fontFamily:"'Orbitron',monospace", lineHeight:1 }}>
          <AnimatedNumber value={typeof value==="number"?value:NaN} decimals={1} />
          {unit && <span style={{fontSize:13,opacity:0.6,marginLeft:3}}>{unit}</span>}
        </div>
      )}
      {sub && <div style={{ fontSize:11, color:"rgba(255,255,255,0.38)", marginTop:5 }}>{sub}</div>}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TIME-AGO
// ═══════════════════════════════════════════════════════════════════════════════
function TimeAgo({ ts, isPulsing }) {
  const [ago, setAgo] = useState("just now");
  useEffect(() => {
    const fn = () => {
      const d = Math.floor((Date.now()-ts)/1000);
      setAgo(d<10?"just now":d<60?`${d}s ago`:`${Math.floor(d/60)}m ago`);
    };
    fn();
    const id = setInterval(fn, 5000);
    return () => clearInterval(id);
  }, [ts]);
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <motion.div
        animate={isPulsing?{scale:[1,1.5,1],opacity:[1,0.3,1]}:{}}
        transition={{duration:0.5}}
        style={{ width:7, height:7, borderRadius:"50%",
          background:"#22c55e", boxShadow:isPulsing?"0 0 10px #4ade80":"0 0 4px #22c55e" }}
      />
      <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Updated {ago}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HISTORY SIDE-PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function HistoryPanel({ isOpen, onClose, historyData, isLoading }) {
  // Group entries by date label
  const grouped = useMemo(() => {
    if (!historyData) return [];
    return Object.entries(historyData)
      .sort(([a],[b]) => b.localeCompare(a)) // newest date first
      .map(([date, entries]) => ({
        date,
        records: Object.entries(entries)
          .sort(([a],[b]) => Number(b)-Number(a)) // newest timestamp first
          .slice(0, 8) // max 8 per day
          .map(([ts, data]) => ({ ts, ...data })),
      }));
  }, [historyData]);

  const condColor = (c) => CONDITION_META[c]?.color || "#c4b5fd";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            transition={{duration:0.3}}
            onClick={onClose}
            style={{ position:"fixed", inset:0, zIndex:40,
              background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)" }}
          />
          {/* Panel */}
          <motion.div
            key="panel"
            initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}}
            transition={{type:"spring", stiffness:320, damping:38}}
            style={{
              position:"fixed", top:0, right:0, bottom:0, zIndex:50,
              width: Math.min(420, window.innerWidth - 32),
              background:"linear-gradient(180deg,rgba(12,18,40,0.97) 0%,rgba(8,14,30,0.99) 100%)",
              borderLeft:"1px solid rgba(255,255,255,0.08)",
              boxShadow:"-20px 0 60px rgba(0,0,0,0.6)",
              display:"flex", flexDirection:"column",
              overflow:"hidden",
            }}
          >
            {/* Panel header */}
            <div style={{ padding:"20px 20px 16px",
              borderBottom:"1px solid rgba(255,255,255,0.06)",
              display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:11, letterSpacing:"0.2em", color:"#a78bfa",
                  textTransform:"uppercase", marginBottom:4 }}>Weather Archive</div>
                <div style={{ fontSize:18, fontWeight:800,
                  fontFamily:"'Orbitron',monospace" }}>History Log</div>
              </div>
              <motion.button
                whileHover={{scale:1.1, background:"rgba(255,255,255,0.1)"}}
                whileTap={{scale:0.95}}
                onClick={onClose}
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:8, width:34, height:34, display:"flex",
                  alignItems:"center", justifyContent:"center", cursor:"pointer", color:"white" }}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Panel body */}
            <div style={{ flex:1, overflowY:"auto", padding:"16px 20px",
              scrollbarWidth:"thin", scrollbarColor:"rgba(255,255,255,0.1) transparent" }}>
              {isLoading ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
                  height:200, gap:10, color:"rgba(255,255,255,0.35)" }}>
                  <motion.div animate={{rotate:360}} transition={{duration:1.2,repeat:Infinity,ease:"linear"}}>
                    <RefreshCw size={18} />
                  </motion.div>
                  <span style={{fontSize:13, fontFamily:"'Syne',sans-serif"}}>Loading archive...</span>
                </div>
              ) : grouped.length === 0 ? (
                <div style={{ textAlign:"center", paddingTop:60,
                  color:"rgba(255,255,255,0.28)", fontSize:13, fontFamily:"'Syne',sans-serif" }}>
                  No history recorded yet.<br/>
                  <span style={{fontSize:11,opacity:0.6}}>First snapshot saves after 3 hours.</span>
                </div>
              ) : (
                grouped.map(({ date, records }) => (
                  <div key={date} style={{marginBottom:24}}>
                    <div style={{ fontSize:10, letterSpacing:"0.18em", color:"rgba(255,255,255,0.35)",
                      textTransform:"uppercase", marginBottom:10, paddingBottom:6,
                      borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      {date}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {records.map(({ ts, temperature_c, temperature_f, humidity,
                        pressure_hpa, feels_like_c, condition, pred_3h }) => {
                        const cond = condition || classifyCondition(pred_3h);
                        const cc   = condColor(cond);
                        const time = new Date(Number(ts)).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
                        return (
                          <motion.div key={ts}
                            initial={{opacity:0,x:20}} animate={{opacity:1,x:0}}
                            transition={{duration:0.3}}
                            style={{
                              background:"rgba(255,255,255,0.03)",
                              border:`1px solid ${cc}22`,
                              borderLeft:`3px solid ${cc}`,
                              borderRadius:10, padding:"10px 14px",
                            }}>
                            <div style={{ display:"flex", justifyContent:"space-between",
                              alignItems:"center", marginBottom:6 }}>
                              <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)",
                                fontFamily:"'Orbitron',monospace" }}>{time}</span>
                              <span style={{ fontSize:9, color:cc, fontWeight:600,
                                textTransform:"uppercase", letterSpacing:"0.1em" }}>
                                {CONDITION_META[cond]?.label || cond}
                              </span>
                            </div>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                              {[
                                {label:"Temp", value:`${temperature_c?.toFixed(1)}°C`},
                                {label:"Humid", value:`${humidity?.toFixed(0)}%`},
                                {label:"Press", value:`${pressure_hpa?.toFixed(0)}hPa`},
                              ].map(({label,value}) => (
                                <div key={label} style={{textAlign:"center"}}>
                                  <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginBottom:2}}>{label}</div>
                                  <div style={{fontSize:13,fontWeight:700,
                                    fontFamily:"'Orbitron',monospace",color:"white"}}>{value}</div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function WeatherDashboard() {
  const [weather, setWeather]         = useState(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [isPulsing, setIsPulsing]     = useState(false);
  const [connected, setConnected]     = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [histLoading, setHistLoading] = useState(false);
  const [todayHigh, setTodayHigh]     = useState(null);
  const [todayLow, setTodayLow]       = useState(null);

  // Track today's high/low — resets at midnight via dateKey
  const dateKeyRef     = useRef(todayStr());
  const lastHistoryRef = useRef(0);   // millis of last 3-hour history snapshot

  // ── Firebase real-time listener ────────────────────────────────────────────
  // onValue fires immediately with the current value, then again on every
  // change. The ESP32 writes to /live_data every 5 minutes; this listener
  // picks it up within milliseconds of the write landing.
  useEffect(() => {
    const liveRef = ref(database, "live_data");
    const unsub = onValue(
      liveRef,
      (snap) => {
        const d = snap.val();
        if (!d) return;           // node empty — wait for first ESP32 write
        processIncoming(d);
        setConnected(true);
      },
      (err) => {
        console.error("[Firebase] live_data listener error:", err);
        setConnected(false);
      }
    );
    return () => unsub();         // detach listener on unmount
  // processIncoming is stable (useCallback with no deps that change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core incoming data processor ──────────────────────────────────────────
  const processIncoming = useCallback((d) => {
    setWeather(d);
    setLastUpdated(Date.now());
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 1000);

    // Reset high/low at midnight
    const today = todayStr();
    if (dateKeyRef.current !== today) {
      dateKeyRef.current = today;
      setTodayHigh(d.temperature_c);
      setTodayLow(d.temperature_c);
    } else {
      setTodayHigh(prev => prev === null ? d.temperature_c : Math.max(prev, d.temperature_c));
      setTodayLow(prev  => prev === null ? d.temperature_c : Math.min(prev, d.temperature_c));
    }

    // ── History snapshot every 3 hours ──────────────────────────────────────
    // On each incoming reading we check if 3 hours have elapsed since the
    // last write. If so, push a timestamped snapshot to /history/YYYY-MM-DD/.
    // The timestamp (ms) is used as the key so records sort chronologically.
    const now = Date.now();
    if (now - lastHistoryRef.current >= THREE_HOUR_MS) {
      lastHistoryRef.current = now;
      const dateKey = todayStr();
      const histRef = ref(database, `history/${dateKey}/${now}`);
      set(histRef, { ...d, condition: classifyCondition(d.pred_3h) })
        .catch(err => console.error("[Firebase] History write failed:", err));
    }
  }, []);

  // ── Stable condition — only recalculates when pred_3h changes ─────────────
  // This is the key to animation stability: the background NEVER re-renders
  // from temperature/humidity updates, only from pred_3h changes.
  const condition = useMemo(
    () => classifyCondition(weather?.pred_3h),
    [weather?.pred_3h]        // ← dep is ONLY pred_3h
  );

  const meta      = CONDITION_META[condition];
  const Background = BG_MAP[condition];
  const MainIcon  = condition==="storm" ? CloudLightning
    : condition==="rain"  ? CloudRain
    : condition==="clear" ? Sun : Cloud;

  // ── History fetch ──────────────────────────────────────────────────────────
  // Called once when the user opens the History panel.
  // get() is a one-time read (not a persistent listener) — appropriate here
  // because history data only grows at 3-hour intervals.
  const openHistory = useCallback(async () => {
    setShowHistory(true);
    if (historyData) return;   // already fetched this session
    setHistLoading(true);
    try {
      const snap = await get(ref(database, "history"));
      setHistoryData(snap.val() || {});
    } catch (err) {
      console.error("[Firebase] History fetch failed:", err);
      setHistoryData({});        // show empty panel rather than infinite spinner
    } finally {
      setHistLoading(false);
    }
  }, [historyData]);

  // ── Loading screen — shown until first real ESP32 reading arrives ──────────
  if (!weather) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
        justifyContent:"center", background:"#0a0f20", flexDirection:"column", gap:16 }}>
        <style>{FONTS}</style>
        <motion.div animate={{opacity:[0.25,1,0.25]}} transition={{duration:2,repeat:Infinity}}
          style={{color:"rgba(255,255,255,0.45)",fontSize:13,
            letterSpacing:"0.24em",fontFamily:"'Orbitron',monospace"}}>
          AWAITING SENSOR DATA...
        </motion.div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",
          fontFamily:"'Syne',sans-serif"}}>
          Connecting to Firebase · /live_data
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", fontFamily:"'Syne',sans-serif", color:"white", position:"relative" }}>
      <style>{`
        ${FONTS}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.09);border-radius:2px}
      `}</style>

      {/* ── Dynamic background — only re-mounts when condition changes ──────── */}
      <AnimatePresence mode="wait">
        <motion.div key={condition}
          initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
          transition={{duration:1.8}}>
          <Background />
        </motion.div>
      </AnimatePresence>

      {/* Grain overlay */}
      <div style={{ position:"fixed", inset:0, zIndex:1, pointerEvents:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.028'/%3E%3C/svg%3E")`,
        backgroundSize:"200px 200px" }} />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{ position:"relative", zIndex:2,
        maxWidth:920, margin:"0 auto", padding:"22px 18px 44px" }}>

        {/* Header */}
        <motion.div initial={{opacity:0,y:-18}} animate={{opacity:1,y:0}}
          style={{ display:"flex", justifyContent:"space-between",
            alignItems:"flex-start", marginBottom:28 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:"0.26em", color:meta.color,
              textTransform:"uppercase", marginBottom:5,
              textShadow:`0 0 18px ${meta.color}` }}>
              ESP32 · BME280 · WEATHER STATION
            </div>
            <div style={{ fontSize:20, fontWeight:800, fontFamily:"'Orbitron',monospace" }}>
              Home Station
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.38)", marginTop:2 }}>
              Jaipur, Rajasthan
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
            {/* History button */}
            <motion.button
              whileHover={{scale:1.04, background:`${meta.color}18`}}
              whileTap={{scale:0.96}}
              onClick={openHistory}
              style={{
                display:"flex", alignItems:"center", gap:7,
                background:"rgba(255,255,255,0.05)",
                border:`1px solid ${meta.color}40`,
                borderRadius:8, padding:"7px 13px",
                color:"white", cursor:"pointer",
                fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:600,
                letterSpacing:"0.06em",
              }}>
              <History size={14} style={{color:meta.color}} />
              HISTORY
            </motion.button>

            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {connected
                ? <Wifi size={13} style={{color:"#4ade80"}} />
                : <WifiOff size={13} style={{color:"#f87171"}} />}
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.42)",
                letterSpacing:"0.1em" }}>{connected?"LIVE":"OFFLINE"}</span>
            </div>
            <TimeAgo ts={lastUpdated} isPulsing={isPulsing} />
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)" }}>
              {weather.buf_samples} pressure samples
            </div>
          </div>
        </motion.div>

        {/* Hero card */}
        <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}}
          transition={{duration:0.65,delay:0.08}}
          style={{
            background:`linear-gradient(135deg,${meta.color}0e,rgba(255,255,255,0.025))`,
            border:`1px solid ${meta.color}2a`,
            borderRadius:22, padding:"24px 26px 20px", marginBottom:18,
            backdropFilter:"blur(22px)",
            boxShadow:`0 0 55px ${meta.color}12,0 4px 30px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.065)`,
            position:"relative", overflow:"hidden",
          }}>
          <div style={{ position:"absolute", top:0, right:0, width:200, height:200,
            background:`radial-gradient(circle at top right,${meta.color}10,transparent 62%)`,
            pointerEvents:"none" }} />

          <div style={{ display:"flex", alignItems:"center",
            justifyContent:"space-between", flexWrap:"wrap", gap:14 }}>
            {/* Icon + condition */}
            <div style={{ display:"flex", alignItems:"center", gap:18 }}>
              <motion.div
                animate={
                  condition==="storm" ? {rotate:[-5,5,-5],scale:[1,1.06,1]} :
                  condition==="clear" ? {rotate:[0,360]} :
                  condition==="rain"  ? {y:[0,-5,0]} :
                  {scale:[1,1.04,1]}
                }
                transition={
                  condition==="clear"
                    ? {duration:12,repeat:Infinity,ease:"linear"}
                    : {duration:2.8,repeat:Infinity,ease:"easeInOut"}
                }>
                <MainIcon size={52} style={{color:meta.color,
                  filter:`drop-shadow(0 0 14px ${meta.color})`}} />
              </motion.div>
              <div>
                <div style={{ fontSize:10, letterSpacing:"0.22em",
                  color:"rgba(255,255,255,0.38)", marginBottom:3 }}>
                  CURRENT CONDITION
                </div>
                <div style={{ fontSize:26, fontWeight:800,
                  fontFamily:"'Orbitron',monospace",
                  color:meta.color,
                  textShadow:`0 0 28px ${meta.color}70` }}>
                  {meta.label}
                </div>
              </div>
            </div>

            {/* Temperature */}
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:66, fontWeight:900,
                fontFamily:"'Orbitron',monospace", lineHeight:1,
                color:"white", textShadow:"0 0 36px rgba(255,255,255,0.25)" }}>
                <AnimatedNumber value={weather.temperature_c} decimals={1} />
                <span style={{fontSize:26,opacity:0.55}}>°C</span>
              </div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.42)", marginTop:1 }}>
                <AnimatedNumber value={weather.temperature_f} decimals={1} />°F
              </div>
            </div>
          </div>

          {/* Today High / Low strip */}
          <div style={{ display:"flex", gap:24, marginTop:18,
            paddingTop:14, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <ArrowUp size={13} style={{color:"#f87171"}} />
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.38)",
                textTransform:"uppercase", letterSpacing:"0.1em" }}>Today's High</span>
              <span style={{ fontSize:15, fontWeight:700,
                fontFamily:"'Orbitron',monospace", color:"#fca5a5" }}>
                <AnimatedNumber value={todayHigh} decimals={1} />°
              </span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <ArrowDown size={13} style={{color:"#60a5fa"}} />
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.38)",
                textTransform:"uppercase", letterSpacing:"0.1em" }}>Today's Low</span>
              <span style={{ fontSize:15, fontWeight:700,
                fontFamily:"'Orbitron',monospace", color:"#93c5fd" }}>
                <AnimatedNumber value={todayLow} decimals={1} />°
              </span>
            </div>
          </div>
        </motion.div>

        {/* Gauges row */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
          {[
            { Icon:Droplets, color:"#60a5fa", label:"Humidity",
              value:weather.humidity, min:0, max:100, unit:"%", gLabel:"Relative Humidity", dir:-20 },
            { Icon:Gauge, color:"#a78bfa", label:"Pressure",
              value:weather.pressure_hpa, min:980, max:1040, unit:"hPa", gLabel:"Atm. Pressure", dir:20 },
          ].map(g => (
            <motion.div key={g.label}
              initial={{opacity:0,x:g.dir}} animate={{opacity:1,x:0}}
              transition={{delay:0.18}}
              style={{ background:"rgba(255,255,255,0.036)",
                border:"1px solid rgba(255,255,255,0.072)", borderRadius:18,
                padding:"18px 14px 14px", backdropFilter:"blur(16px)",
                boxShadow:"0 4px 22px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.05)",
                textAlign:"center" }}>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"center", gap:7, marginBottom:10 }}>
                <g.Icon size={14} style={{color:g.color}} />
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.42)",
                  textTransform:"uppercase", letterSpacing:"0.1em" }}>{g.label}</span>
              </div>
              <ArcGauge value={g.value} min={g.min} max={g.max}
                color={g.color} label={g.gLabel} unit={g.unit} size={150} />
            </motion.div>
          ))}
        </div>

        {/* Metric cards */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
          <MetricCard icon={Thermometer} label="Feels Like"
            value={weather.feels_like_c} unit="°C" color="#fb923c" delay={0.28}
            pulse={weather.feels_like_c > 35}
            sub={weather.feels_like_c > 35 ? "⚠ Heat stress" : "Comfortable"} />
          <MetricCard icon={Eye} label="Altitude"
            value={weather.altitude_m} unit="m" color="#34d399" delay={0.33}
            sub="Above sea level" />
          <MetricCard icon={Wind} label="Tendency"
            color="#f472b6" delay={0.38}
            sub={weather.pred_3h?.split(" ").slice(0,2).join(" ")}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
              {(() => {
                const p = (weather.pred_3h||"").toLowerCase();
                if(p.includes("storm")||p.includes("rain"))
                  return <TrendingDown size={18} style={{color:"#f87171"}} />;
                if(p.includes("improving")||p.includes("clear"))
                  return <TrendingUp size={18} style={{color:"#4ade80"}} />;
                return <Minus size={18} style={{color:"#94a3b8"}} />;
              })()}
              <span style={{ fontSize:28, fontWeight:800, color:"white",
                fontFamily:"'Orbitron',monospace", lineHeight:1 }}>
                <AnimatedNumber value={weather.pressure_hpa} decimals={0} />
              </span>
              <span style={{fontSize:12,opacity:0.55,marginTop:2}}>hPa</span>
            </div>
          </MetricCard>
        </div>

        {/* Prediction grid */}
        <motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}}
          transition={{delay:0.42}}
          style={{ background:"rgba(255,255,255,0.02)",
            border:"1px solid rgba(255,255,255,0.055)",
            borderRadius:18, padding:"18px 18px 16px", backdropFilter:"blur(12px)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <Clock size={13} style={{color:"rgba(255,255,255,0.38)"}} />
            <span style={{ fontSize:10, letterSpacing:"0.16em",
              color:"rgba(255,255,255,0.38)", textTransform:"uppercase" }}>
              Multi-Window Forecast
            </span>
            <div style={{ flex:1, height:1,
              background:"rgba(255,255,255,0.055)", marginLeft:4 }} />
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.22)" }}>
              Pressure Tendency · 144-sample ring buffer
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <PredBadge label="3 Hours"  pred={weather.pred_3h}  delay={0.48} />
            <PredBadge label="6 Hours"  pred={weather.pred_6h}  delay={0.56} />
            <PredBadge label="12 Hours" pred={weather.pred_12h} delay={0.64} />
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.8}}
          style={{ marginTop:18, display:"flex", justifyContent:"space-between",
            alignItems:"center", padding:"10px 4px",
            borderTop:"1px solid rgba(255,255,255,0.045)" }}>
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.18)", letterSpacing:"0.1em" }}>
            BME280 @ 0x77 · SDA GPIO21 · SCL GPIO22
          </span>
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.18)", letterSpacing:"0.08em" }}>
            FIREBASE RTDB · 5-MIN REFRESH · 3-HR HISTORY
          </span>
        </motion.div>
      </div>

      {/* History side-panel */}
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        historyData={historyData}
        isLoading={histLoading}
      />
    </div>
  );
}
