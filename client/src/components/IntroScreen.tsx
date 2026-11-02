import { useEffect, useState } from "react";

/**
 * IntroScreen — full-screen glass hero shown on first visit.
 * Ambient gradient orbs + a centered glass card with the Veridian
 * wordmark, an animated tagline, and a gradient enter button.
 */

const TAGLINES = [
  "See any stock clearly.",
  "Fair value, modeled in seconds.",
  "Your research, organized.",
];
const TYPE_SPEED = 34;
const ERASE_SPEED = 22;
const HOLD_MS = 1600;

export default function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing">("typing");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      const target = TAGLINES[idx];
      if (text.length < target.length) {
        t = setTimeout(() => setText(target.slice(0, text.length + 1)), TYPE_SPEED);
      } else {
        setPhase("holding");
      }
    } else if (phase === "holding") {
      t = setTimeout(() => setPhase("erasing"), HOLD_MS);
    } else {
      if (text.length > 0) {
        t = setTimeout(() => setText(text.slice(0, -1)), ERASE_SPEED);
      } else {
        setIdx(i => (i + 1) % TAGLINES.length);
        setPhase("typing");
      }
    }
    return () => clearTimeout(t);
  }, [phase, text, idx]);

  // Enter on Escape/Enter key
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") onEnter();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onEnter]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 overflow-hidden"
      style={{ background: "hsl(235 32% 7%)" }}
      data-testid="intro-screen"
    >
      {/* Ambient orbs */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(40rem 40rem at 20% 0%, hsl(248 85% 62% / 0.35), transparent 60%)," +
            "radial-gradient(34rem 34rem at 85% 15%, hsl(195 90% 55% / 0.25), transparent 60%)," +
            "radial-gradient(38rem 38rem at 70% 95%, hsl(258 85% 64% / 0.28), transparent 60%)," +
            "radial-gradient(28rem 28rem at 10% 90%, hsl(330 85% 62% / 0.18), transparent 60%)",
        }}
      />

      {/* Glass card */}
      <div className="glass-panel relative w-full max-w-md px-8 py-12 text-center card-lift">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Investment Research Platform
        </p>

        <h1
          className="mt-4 text-5xl font-bold tracking-tight text-gradient"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Veridian
        </h1>

        {/* Animated tagline */}
        <div className="h-7 mt-4 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            {text}
            <span className="inline-block w-[2px] h-4 ml-0.5 bg-primary animate-pulse align-middle" />
          </p>
        </div>

        <button
          onClick={onEnter}
          data-testid="button-enter"
          className="mt-8 px-8 py-3 rounded-full text-sm font-semibold text-white accent-gradient shadow-lg shadow-primary/30 transition-all duration-200 hover:scale-[1.03] hover:shadow-xl hover:shadow-primary/40 active:scale-[0.98]"
        >
          Enter Platform
        </button>

        <p className="mt-6 text-[10px] text-muted-foreground/60">
          Live market data · Fair value models · Portfolio tools
        </p>
      </div>

      {/* Version tag */}
      <p className="absolute bottom-4 right-5 text-[10px] text-muted-foreground/40">v5.1</p>
    </div>
  );
}
