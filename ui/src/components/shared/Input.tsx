import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export default function Input({ label, className = "", ...props }: InputProps) {
  const inputId = React.useId();

  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={inputId} className="text-xs text-text-secondary font-medium">{label}</label>}
      <input
        id={inputId}
        className={`w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-blue/50 transition-colors ${className}`}
        {...props}
      />
    </div>
  );
}

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function TextArea({ label, className = "", ...props }: TextAreaProps) {
  const inputId = React.useId();

  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={inputId} className="text-xs text-text-secondary font-medium">{label}</label>}
      <textarea
        id={inputId}
        className={`w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent-blue/50 transition-colors resize-y ${className}`}
        {...props}
      />
    </div>
  );
}
