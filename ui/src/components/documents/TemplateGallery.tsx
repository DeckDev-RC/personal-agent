import React from "react";
import { FileText } from "lucide-react";
import type { DocumentTemplate } from "../../../../src/types/document.js";
import Badge from "../shared/Badge";

type TemplateGalleryProps = {
  templates: DocumentTemplate[];
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
};

export default function TemplateGallery({
  templates,
  selectedTemplateId,
  onSelect,
}: TemplateGalleryProps) {
  return (
    <div className="space-y-2">
      {templates.map((template) => (
        <button
          key={template.id}
          onClick={() => onSelect(template.id)}
          className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors cursor-pointer ${
            selectedTemplateId === template.id
              ? "border-accent-blue/30 bg-accent-blue/10"
              : "border-border bg-bg-primary hover:bg-white/5"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText size={15} className="shrink-0 text-accent-blue" />
                <span className="truncate text-sm font-medium text-text-primary">{template.name}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary/75">
                {template.description}
              </p>
            </div>
            <Badge color="gray">{template.category}</Badge>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {template.placeholders.slice(0, 4).map((placeholder) => (
              <Badge key={placeholder} color="gray" className="text-[10px]">
                {placeholder}
              </Badge>
            ))}
            {template.placeholders.length > 4 && (
              <Badge color="gray" className="text-[10px]">
                +{template.placeholders.length - 4}
              </Badge>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
