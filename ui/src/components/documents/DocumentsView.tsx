import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileStack, RefreshCw } from "lucide-react";
import type { DocumentTemplate, RenderedDocument, SavedDocumentExport } from "../../../../src/types/document.js";
import TemplateGallery from "./TemplateGallery";
import DocumentPreview from "./DocumentPreview";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";

const api = () => (window as any).codexAgent;

export default function DocumentsView() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<RenderedDocument | null>(null);
  const [busyFormat, setBusyFormat] = useState<"markdown" | "html" | "pdf" | null>(null);
  const [lastExport, setLastExport] = useState<SavedDocumentExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTemplates() {
    setLoading(true);
    setError("");
    try {
      const nextTemplates = await api().documents.listTemplates();
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => current || nextTemplates[0]?.id || "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setRendered(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const nextRendered = await api().documents.render({
          templateId: selectedTemplateId,
          values,
        });
        if (cancelled) {
          return;
        }
        setRendered(nextRendered);
        setValues((current) => {
          let changed = false;
          const nextValues = { ...current };

          for (const [key, value] of Object.entries(nextRendered.values)) {
            if (!Object.prototype.hasOwnProperty.call(current, key)) {
              nextValues[key] = value;
              changed = true;
            }
          }

          return changed ? nextValues : current;
        });
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplateId, values]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  async function handleExport(format: "markdown" | "html" | "pdf") {
    if (!selectedTemplateId) {
      return;
    }
    setBusyFormat(format);
    setError("");
    try {
      const nextExport = await api().documents.export({
        templateId: selectedTemplateId,
        values,
        format,
      });
      setLastExport(nextExport);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusyFormat(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <FileStack size={18} className="text-accent-blue" />
                {t("documents.title")}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-text-secondary/75">
                {t("documents.subtitle")}
              </p>
            </div>

            <Button variant="secondary" size="sm" onClick={() => void loadTemplates()}>
              <RefreshCw size={14} />
              {t("documents.refresh")}
            </Button>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-6 py-16 text-center text-sm text-text-secondary">
            {t("common.loading")}
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<FileStack size={18} />}
            title={t("documents.emptyTitle")}
            description={t("documents.emptyDescription")}
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
            <section className="rounded-2xl border border-border bg-bg-secondary/70 p-4">
              <div className="mb-3 text-sm font-semibold text-text-primary">
                {t("documents.galleryTitle")}
              </div>
              <TemplateGallery
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onSelect={(templateId) => {
                  setSelectedTemplateId(templateId);
                  setValues({});
                  setLastExport(null);
                }}
              />
            </section>

            <DocumentPreview
              template={selectedTemplate}
              rendered={rendered}
              values={values}
              busyFormat={busyFormat}
              lastExport={lastExport}
              onChangeValue={(key, value) =>
                setValues((current) => ({
                  ...current,
                  [key]: value,
                }))
              }
              onExport={(format) => void handleExport(format)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
