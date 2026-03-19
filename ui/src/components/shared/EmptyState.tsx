import React from "react";
import Button from "./Button";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <div className="text-text-secondary opacity-40 text-4xl">{icon}</div>}
      <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
      {description && <p className="max-w-xs text-xs text-text-secondary/70">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
