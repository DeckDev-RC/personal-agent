import React from "react";

type BadgeProps = {
  children: React.ReactNode;
  color?: "green" | "blue" | "orange" | "red" | "gray";
  className?: string;
};

const colors = {
  green: "bg-accent-green/15 text-accent-green",
  blue: "bg-accent-blue/15 text-accent-blue",
  orange: "bg-accent-orange/15 text-accent-orange",
  red: "bg-red-500/15 text-red-400",
  gray: "bg-white/8 text-text-secondary",
};

export default function Badge({ children, color = "gray", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${colors[color]} ${className}`}
    >
      {children}
    </span>
  );
}
