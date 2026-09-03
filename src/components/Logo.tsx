import React from "react";
export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: "icon-only" | "header" | "login";
  className?: string;
}

export function Logo({ variant = "header", className, ...props }: LogoProps) {
  const isIcon = variant === "icon-only";
  const isLogin = variant === "login";

  // Dimensions based on variant
  const width = isIcon ? 32 : isLogin ? 240 : 240;
  const height = isIcon ? 32 : isLogin ? 70 : 40;
  const viewBox = isIcon ? "0 0 32 32" : "0 0 240 40";

  return (
    <div className={`inline-flex flex-col items-center justify-center shrink-0 ${className || ""}`}>
      <svg
        width={width}
        height={height}
        viewBox={viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
        {...props}
      >
        {/* Icon: Stylized Tree Canopy + Looped Trunk Arrow */}
        <g transform={isIcon ? "translate(0,0)" : "translate(0,4)"}>
          {/* Loop Trunk */}
          <path
            d="M 16 30 C 10 30 6 26 6 20 C 6 12 16 6 16 6 C 16 6 26 12 26 20 C 26 23 24 26 21 28"
            stroke="url(#trunkGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          {/* Arrow head on the loop */}
          <path
            d="M 18 26 L 21 28 L 23 25"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Canopy Leaves */}
          <circle cx="10" cy="14" r="4" fill="#059669" opacity="0.9" />
          <circle cx="22" cy="14" r="4" fill="#34d399" opacity="0.9" />
          <circle cx="16" cy="9" r="5" fill="#10b981" />
        </g>

        {/* Wordmark (hidden in icon-only mode) */}
        {!isIcon && (
          <text
            x="38"
            y="26"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight="800"
            fontSize="22"
            letterSpacing="-0.5"
          >
            <tspan fill="currentColor" className="text-[var(--foreground)]">Surviva</tspan>
            <tspan fill="#10b981">Loop</tspan>
          </text>
        )}

        <defs>
          <linearGradient id="trunkGradient" x1="6" y1="30" x2="26" y2="6" gradientUnits="userSpaceOnUse">
            <stop stopColor="#059669" />
            <stop offset="1" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      {isLogin && (
        <span className="text-[10px] font-medium tracking-widest uppercase text-zinc-500 dark:text-zinc-400 mt-1">
          Every Tree. Every Day.
        </span>
      )}
    </div>
  );
}
