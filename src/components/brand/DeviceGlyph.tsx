"use client";

/**
 * Small device marks for filters, pills, and empty states.
 *
 * iPhone is a tall candybar. iPhone Duo is the closed foldable: shorter,
 * wider, with the hinge on the left. Everything else keeps its emoji.
 */
import { useId } from "react";

const SHELL = ["#ffb7e0", "#d7c6ff", "#b9dcff"] as const;
const INK = "#3a2342";

export function DeviceGlyph({
  id,
  fallback,
  size = "sm",
  className,
}: {
  id: string;
  fallback?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  if (id === "iphone") return <Candybar size={size} className={className} />;
  if (id === "iphone-duo") return <Foldable size={size} className={className} />;
  return (
    <span
      aria-hidden
      className={
        size === "lg" ? "text-3xl leading-none" : "text-sm leading-none"
      }
    >
      {fallback}
    </span>
  );
}

function frameClass(size: "sm" | "lg", className?: string) {
  return className ?? (size === "lg" ? "h-9 w-9" : "h-4 w-4 shrink-0");
}

function useGradientId() {
  return useId().replace(/:/g, "");
}

function Candybar({
  size,
  className,
}: {
  size: "sm" | "lg";
  className?: string;
}) {
  const g = useGradientId();
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={frameClass(size, className)}
    >
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={SHELL[0]} />
          <stop offset="0.55" stopColor={SHELL[1]} />
          <stop offset="1" stopColor={SHELL[2]} />
        </linearGradient>
      </defs>
      <rect
        x="7.1"
        y="1.4"
        width="9.8"
        height="21.2"
        rx="2.7"
        fill={`url(#${g})`}
        stroke="#fff"
        strokeWidth="1.3"
      />
      <rect
        x="8.7"
        y="3.3"
        width="6.6"
        height="16.4"
        rx="1.3"
        fill="#fff"
        opacity="0.62"
      />
      <rect x="9.7" y="4.3" width="4.6" height="1.15" rx="0.55" fill={INK} />
    </svg>
  );
}

function Foldable({
  size,
  className,
}: {
  size: "sm" | "lg";
  className?: string;
}) {
  const g = useGradientId();
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={frameClass(size, className)}
    >
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.5" stopColor="#e7d6ff" />
          <stop offset="1" stopColor="#b9dcff" />
        </linearGradient>
      </defs>
      <rect
        x="5.2"
        y="2.6"
        width="13.6"
        height="18.8"
        rx="2.6"
        fill={`url(#${g})`}
        stroke="#fff"
        strokeWidth="1.3"
      />
      <rect x="5.2" y="2.6" width="2.3" height="18.8" rx="1.15" fill={INK} opacity="0.28" />
      <rect
        x="8.4"
        y="4.4"
        width="8.8"
        height="13.6"
        rx="1.3"
        fill="#fff"
        opacity="0.62"
      />
      <circle cx="14.2" cy="6.5" r="0.75" fill={INK} />
      <circle cx="16" cy="6.5" r="0.75" fill={INK} />
    </svg>
  );
}
