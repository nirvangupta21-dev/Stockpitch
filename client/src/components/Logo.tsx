export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <svg
        aria-label="Veridian"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={compact ? "w-7 h-7 shrink-0" : "w-8 h-8 shrink-0"}
      >
        <defs>
          <linearGradient id="vrd-g" x1="0" y1="36" x2="36" y2="0">
            <stop offset="0%" stopColor="hsl(245 80% 62%)" />
            <stop offset="100%" stopColor="hsl(195 90% 55%)" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="10" fill="url(#vrd-g)" opacity="0.18" />
        <rect x="0.5" y="0.5" width="35" height="35" rx="9.5" stroke="url(#vrd-g)" strokeOpacity="0.45" />
        <polyline
          points="7,26 13,20 18,23 24,12 29,9"
          stroke="url(#vrd-g)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="29" cy="9" r="2.2" fill="hsl(190 95% 60%)" />
      </svg>
      <span
        className={`${compact ? "text-sm" : "text-base"} font-semibold tracking-tight`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        Veridian
      </span>
    </div>
  );
}
