/**
 * IntroScreen — cinematic entry gate for Veridian
 *
 * Sequence:
 *   0.0s  — black, grid fades in
 *   0.6s  — "VERIDIAN" types in letter by letter
 *   1.8s  — subtitle fades up
 *   2.8s  — "Welcome, Investor." fades in
 *   3.8s  — enter button pulses in
 *   on click — everything fades to black → onEnter fires
 */

import { useEffect, useState, useRef } from "react";

interface Props { onEnter: () => void; }

const BRAND   = "VERIDIAN";
const TAGLINE = "Investment Research Platform";
const WELCOME = "Welcome, Investor.";

export default function IntroScreen({ onEnter }: Props) {
  const [phase, setPhase]         = useState(0); // 0=blank 1=grid 2=typing 3=sub 4=welcome 5=btn 6=exiting
  const [typed, setTyped]         = useState("");
  const [exiting, setExiting]     = useState(false);
  const typingRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase timer cascade
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);   // grid in
    const t2 = setTimeout(() => setPhase(2), 700);   // start typing
    const t3 = setTimeout(() => setPhase(3), 2000);  // subtitle
    const t4 = setTimeout(() => setPhase(4), 2900);  // welcome
    const t5 = setTimeout(() => setPhase(5), 3900);  // button
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout);
  }, []);

  // Typewriter
  useEffect(() => {
    if (phase !== 2) return;
    let i = 0;
    typingRef.current = setInterval(() => {
      i++;
      setTyped(BRAND.slice(0, i));
      if (i >= BRAND.length && typingRef.current) {
        clearInterval(typingRef.current);
      }
    }, 90);
    return () => { if (typingRef.current) clearInterval(typingRef.current); };
  }, [phase]);

  const handleEnter = () => {
    setExiting(true);
    setTimeout(onEnter, 900);
  };

  return (
    <div
      className="intro-root"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#080808",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        opacity: exiting ? 0 : 1,
        transition: exiting ? "opacity 0.85s ease" : "none",
      }}
    >
      {/* Animated grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        opacity: phase >= 1 ? 0.06 : 0,
        transition: "opacity 1.2s ease",
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
      }} />

      {/* Radial glow behind logo */}
      <div style={{
        position: "absolute",
        width: 600, height: 600,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
        opacity: phase >= 2 ? 1 : 0,
        transition: "opacity 1.5s ease",
      }} />

      {/* Corner decorators */}
      {[
        { top: 24, left: 24 },
        { top: 24, right: 24 },
        { bottom: 24, left: 24 },
        { bottom: 24, right: 24 },
      ].map((style, i) => (
        <div key={i} style={{
          position: "absolute", ...style,
          width: 20, height: 20,
          borderTop: i < 2 ? "1px solid rgba(255,255,255,0.15)" : "none",
          borderBottom: i >= 2 ? "1px solid rgba(255,255,255,0.15)" : "none",
          borderLeft: i % 2 === 0 ? "1px solid rgba(255,255,255,0.15)" : "none",
          borderRight: i % 2 === 1 ? "1px solid rgba(255,255,255,0.15)" : "none",
          opacity: phase >= 1 ? 1 : 0,
          transition: `opacity 0.6s ease ${i * 0.1}s`,
        }} />
      ))}

      {/* Top scan line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
        opacity: phase >= 1 ? 1 : 0,
        transition: "opacity 0.8s ease",
        animation: phase >= 1 ? "scan 4s linear infinite" : "none",
      }} />

      {/* Center content */}
      <div style={{ textAlign: "center", position: "relative" }}>

        {/* Veridian wordmark */}
        <div style={{
          fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
          fontSize: "clamp(3rem, 10vw, 6.5rem)",
          fontWeight: 800,
          letterSpacing: "0.25em",
          color: "#f2f2f2",
          lineHeight: 1,
          minHeight: "1.1em",
          fontVariantNumeric: "tabular-nums",
        }}>
          {typed}
          {/* blinking cursor */}
          {phase === 2 && typed.length < BRAND.length && (
            <span style={{
              display: "inline-block", width: "0.08em", height: "0.85em",
              background: "#f2f2f2", marginLeft: 4,
              verticalAlign: "middle",
              animation: "blink 0.7s step-end infinite",
            }} />
          )}
        </div>

        {/* Thin rule */}
        <div style={{
          width: phase >= 3 ? "100%" : "0%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
          margin: "18px auto",
          transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
        }} />

        {/* Tagline */}
        <div style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: "clamp(0.65rem, 2vw, 0.8rem)",
          fontWeight: 500,
          letterSpacing: "0.35em",
          color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase",
          opacity: phase >= 3 ? 1 : 0,
          transform: phase >= 3 ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}>
          {TAGLINE}
        </div>

        {/* Welcome */}
        <div style={{
          marginTop: 48,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: "clamp(1rem, 3vw, 1.4rem)",
          fontWeight: 300,
          letterSpacing: "0.05em",
          color: "rgba(255,255,255,0.75)",
          opacity: phase >= 4 ? 1 : 0,
          transform: phase >= 4 ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}>
          {WELCOME}
        </div>

        {/* Enter button */}
        <div style={{
          marginTop: 40,
          opacity: phase >= 5 ? 1 : 0,
          transform: phase >= 5 ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}>
          <button
            onClick={handleEnter}
            data-testid="button-enter"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: "0.7rem",
              fontWeight: 600,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#080808",
              background: "#f2f2f2",
              border: "none",
              borderRadius: 2,
              padding: "12px 36px",
              cursor: "pointer",
              transition: "background 0.2s, transform 0.2s, box-shadow 0.2s",
              boxShadow: "0 0 30px rgba(255,255,255,0.12)",
            }}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.background = "#ffffff";
              (e.target as HTMLElement).style.boxShadow = "0 0 50px rgba(255,255,255,0.25)";
              (e.target as HTMLElement).style.transform = "scale(1.03)";
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.background = "#f2f2f2";
              (e.target as HTMLElement).style.boxShadow = "0 0 30px rgba(255,255,255,0.12)";
              (e.target as HTMLElement).style.transform = "scale(1)";
            }}
          >
            Open Research Platform
          </button>
        </div>

        {/* Version tag */}
        <div style={{
          marginTop: 20,
          fontSize: "0.6rem",
          letterSpacing: "0.2em",
          color: "rgba(255,255,255,0.15)",
          opacity: phase >= 5 ? 1 : 0,
          transition: "opacity 1s ease 0.3s",
        }}>
          v2.0 · QUANTITATIVE EDITION
        </div>
      </div>

      {/* Bottom status bar */}
      <div style={{
        position: "absolute", bottom: 24, left: 0, right: 0,
        display: "flex", justifyContent: "center",
        gap: 32,
        opacity: phase >= 5 ? 0.25 : 0,
        transition: "opacity 1s ease",
        fontSize: "0.55rem",
        letterSpacing: "0.2em",
        color: "rgba(255,255,255,0.6)",
        textTransform: "uppercase",
      }}>
        <span>NYSE · NASDAQ</span>
        <span>·</span>
        <span>Real-Time Data</span>
        <span>·</span>
        <span>Quantitative Models</span>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes scan {
          0%   { transform: translateY(0); }
          100% { transform: translateY(100vh); }
        }
      `}</style>
    </div>
  );
}
