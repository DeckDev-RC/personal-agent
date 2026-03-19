import React from "react";

type TabsProps = {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
};

export default function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              isActive
                ? "text-accent-green border-accent-green"
                : "text-text-secondary border-transparent hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
