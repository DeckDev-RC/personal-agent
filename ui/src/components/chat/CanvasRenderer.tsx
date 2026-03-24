import React, { useEffect, useRef, useState } from "react";
import { Download, Maximize2, Minimize2 } from "lucide-react";

type CanvasRendererProps = {
  type: "mermaid" | "chart" | "table" | "html" | "svg";
  content: string;
  title?: string;
  width?: number;
  height?: number;
};

export default function CanvasRenderer({ type, content, title, width, height }: CanvasRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [rendered, setRendered] = useState<string>("");

  useEffect(() => {
    if (type === "mermaid") {
      // Dynamic import mermaid if available
      import("mermaid").then((mod) => {
        mod.default.initialize({ startOnLoad: false, theme: "dark" });
        mod.default.render(`mermaid-${Date.now()}`, content).then((result) => {
          setRendered(result.svg);
        }).catch(() => setRendered(`<pre>${content}</pre>`));
      }).catch(() => {
        setRendered(`<pre class="text-sm text-gray-300">${content}</pre>`);
      });
    } else if (type === "svg") {
      setRendered(content);
    } else if (type === "html") {
      setRendered(content);
    } else if (type === "table") {
      // Render markdown table as HTML
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length < 2) { setRendered(`<pre>${content}</pre>`); return; }
      const headers = lines[0].split("|").map(h => h.trim()).filter(Boolean);
      const rows = lines.slice(2).map(line => line.split("|").map(c => c.trim()).filter(Boolean));
      const tableHtml = `<table class="w-full text-sm"><thead><tr>${headers.map(h => `<th class="px-3 py-2 text-left border-b border-gray-600">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td class="px-3 py-2 border-b border-gray-700">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      setRendered(tableHtml);
    } else if (type === "chart") {
      setRendered(`<pre class="text-sm text-gray-300">[Chart.js config]\n${content}</pre>`);
    }
  }, [type, content]);

  const handleExport = () => {
    const blob = new Blob([type === "svg" ? content : rendered], { type: type === "svg" ? "image/svg+xml" : "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas-${type}-${Date.now()}.${type === "svg" ? "svg" : "html"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`my-2 rounded-lg border border-gray-700 bg-gray-850 overflow-hidden ${expanded ? "fixed inset-4 z-50 bg-gray-900" : ""}`}
      style={{ width: expanded ? undefined : width, height: expanded ? undefined : height }}>
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800">
          <span className="text-sm font-medium text-gray-200">{title}</span>
          <div className="flex gap-1">
            <button onClick={handleExport} className="p-1 rounded hover:bg-gray-700 text-gray-400" title="Export">
              <Download size={14} />
            </button>
            <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-gray-700 text-gray-400" title={expanded ? "Minimize" : "Maximize"}>
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      )}
      <div ref={containerRef} className="p-3 overflow-auto text-gray-200"
        style={{ maxHeight: expanded ? "calc(100vh - 8rem)" : height ?? 400 }}
        dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  );
}
