export default function Logo() {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <svg
        aria-label="Veridian"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-8 h-8 shrink-0"
      >
        <rect width="36" height="36" rx="8" fill="hsl(185 80% 50% / 0.12)" />
        <polyline
          points="6,26 12,20 18,22 24,12 30,8"
          stroke="hsl(185, 80%, 50%)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <polyline
          points="26,8 30,8 30,12"
          stroke="hsl(185, 80%, 50%)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="30" cy="8" r="2" fill="hsl(185, 80%, 50%)" />
      </svg>
      <span className="text-base font-bold tracking-tight" style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
        Veridian
      </span>
    </div>
  );
}
