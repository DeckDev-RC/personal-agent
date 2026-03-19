import React from "react";

type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
};

export default function Spinner({ size = "md", className = "" }: SpinnerProps) {
  const px = sizes[size];
  return (
    <svg
      className={`animate-spin text-accent-green ${className}`}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}
