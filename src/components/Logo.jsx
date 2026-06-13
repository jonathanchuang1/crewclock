/** CrewClock mark: a clock face fused with a map pin. */
export function Logo({ size = 28, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="CrewClock"
      >
        <defs>
          <linearGradient id="cc-g" x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#3b82f6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path
          d="M16 2c-6.075 0-11 4.701-11 10.5C5 19.5 16 30 16 30s11-10.5 11-17.5C27 6.701 22.075 2 16 2Z"
          fill="url(#cc-g)"
        />
        <circle cx="16" cy="12.5" r="6.2" fill="#0a0b0e" />
        <path
          d="M16 9v3.6l2.4 1.5"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
