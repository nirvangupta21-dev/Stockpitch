export default function Logo() {
  return (
    <svg
      aria-label="PitchStock"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-8 h-8 shrink-0"
    >
      {/* Background hex */}
      <rect width="36" height="36" rx="8" fill="hsl(185 80% 50% / 0.12)" />
      {/* Rising chart line */}
      <polyline
        points="6,26 12,20 18,22 24,12 30,8"
        stroke="hsl(185, 80%, 50%)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Arrow head up */}
      <polyline
        points="26,8 30,8 30,12"
        stroke="hsl(185, 80%, 50%)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Dot at peak */}
      <circle cx="30" cy="8" r="2" fill="hsl(185, 80%, 50%)" />
    </svg>
  );
}
