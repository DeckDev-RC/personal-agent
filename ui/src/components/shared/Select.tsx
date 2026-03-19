import React from "react";

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  disabled?: boolean;
};

export default function Select({ value, onChange, options, label, disabled = false }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-text-secondary">{label}</label>}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary outline-none transition-colors hover:border-white/20 focus:border-accent-green disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
