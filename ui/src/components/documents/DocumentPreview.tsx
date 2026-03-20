import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileText, Save } from "lucide-react";
import type { DocumentTemplate, RenderedDocument, SavedDocumentExport } from "../../../../src/types/document.js";
import Button from "../shared/Button";
import Badge from "../shared/Badge";

function humanizeFieldName(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMultilineField(key: string): boolean {
  return /(summary|scope|agenda|discussion|decision|action|risk|question|notes|context|timeline|criteria|feedback|challenge|growth|deliverable|support|priority|metric|work|blocker|step|review|cause|improvement)/i.test(
    key,
  );
}

type DocumentPreviewProps = {
  template: DocumentTemplate | null;
  rendered: RenderedDocument | null;
  values: Record<string, string>;
  busyFormat: "markdown" | "html" | "pdf" | null;
  lastExport: SavedDocumentExport | null;
  onChangeValue: (key: string, value: string) => void;
  onExport: (format: "markdown" | "html" | "pdf") => void;
};

export default function DocumentPreview({
  template,
  rendered,
  values,
  busyFormat,
  lastExport,
  onChangeValue,
  onExport,
}: DocumentPreviewProps) {
  if (!template) {
    return null;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.9fr),minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <FileText size={16} className="text-accent-orange" />
              {template.name}
            </div>
            <p className="mt-1 text-xs text-text-secondary/70">{template.description}</p>
          </div>
          <Badge color="blue">{template.category}</Badge>
        </div>

        <div className="mt-4 space-y-3">
          {template.placeholders.map((placeholder) => {
            const value = values[placeholder] ?? "";
            const multiline = isMultilineField(placeholder);
            return (
              <label key={placeholder} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-text-secondary">
                  {humanizeFieldName(placeholder)}
                </span>
                {multiline ? (
                  <textarea
                    value={value}
                    onChange={(event) => onChangeValue(placeholder, event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
                  />
                ) : (
                  <input
                    value={value}
                    onChange={(event) => onChangeValue(placeholder, event.target.value)}
                    className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
                  />
                )}
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={busyFormat !== null}
            onClick={() => onExport("markdown")}
          >
            <Save size={14} />
            {busyFormat === "markdown" ? "Saving..." : "Save Markdown"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={busyFormat !== null}
            onClick={() => onExport("html")}
          >
            <Download size={14} />
            {busyFormat === "html" ? "Exporting..." : "Export HTML"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={busyFormat !== null}
            onClick={() => onExport("pdf")}
          >
            <Download size={14} />
            {busyFormat === "pdf" ? "Exporting..." : "Export PDF"}
          </Button>
        </div>

        {lastExport && (
          <div className="mt-4 rounded-xl border border-border bg-bg-primary px-3 py-3 text-xs text-text-secondary/75">
            <div className="font-medium text-text-primary">Last export</div>
            <div className="mt-1">{lastExport.format.toUpperCase()}</div>
            <div className="mt-1 break-all">{lastExport.relativePath ?? lastExport.filePath}</div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-bg-secondary/70">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-text-primary">
            {rendered?.title ?? template.name}
          </div>
          <p className="mt-1 text-xs text-text-secondary/70">
            Live preview rendered from the current template values.
          </p>
        </div>

        <div className="prose prose-invert max-w-none px-5 py-5 text-sm prose-headings:text-text-primary prose-p:text-text-secondary prose-li:text-text-secondary prose-strong:text-text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {rendered?.markdown || template.content}
          </ReactMarkdown>
        </div>
      </section>
    </div>
  );
}
