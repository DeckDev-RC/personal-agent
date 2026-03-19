import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-green/90 text-black hover:bg-accent-green disabled:bg-accent-green/30 disabled:text-black/50",
  secondary:
    "bg-white/8 text-text-primary hover:bg-white/12 border border-border disabled:opacity-40",
  danger:
    "bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-40",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-white/5 disabled:opacity-40",
};

const sizes = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-1.5 text-sm",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
