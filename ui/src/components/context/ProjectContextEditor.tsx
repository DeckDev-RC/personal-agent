import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save } from "lucide-react";
import type { ProjectContext } from "../../../../src/types/projectContext.js";
import { useContextStore } from "../../stores/contextStore";
import Button from "../shared/Button";
import Input, { TextArea } from "../shared/Input";

type ProjectContextEditorProps = {
  projectContext?: ProjectContext;
  onClose: () => void;
};

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatLines(values: string[]): string {
  return values.join("\n");
}

export default function ProjectContextEditor({
  projectContext,
  onClose,
}: ProjectContextEditorProps) {
  const { t } = useTranslation();
  const { createContext, updateContext } = useContextStore();
  const isNew = !projectContext;

  const [name, setName] = useState(projectContext?.name ?? "");
  const [description, setDescription] = useState(projectContext?.description ?? "");
  const [stakeholders, setStakeholders] = useState(formatLines(projectContext?.stakeholders ?? []));
  const [decisions, setDecisions] = useState(formatLines(projectContext?.decisions ?? []));
  const [links, setLinks] = useState(formatLines(projectContext?.links ?? []));
  const [notes, setNotes] = useState(projectContext?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const normalized = useMemo(
    () => ({
      name: name.trim(),
      description: description.trim(),
      stakeholders: parseLines(stakeholders),
      decisions: parseLines(decisions),
      links: parseLines(links),
      notes: notes.trim(),
    }),
    [decisions, description, links, name, notes, stakeholders],
  );

  async function handleSave() {
    if (!normalized.name) {
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await createContext(normalized);
      } else {
        await updateContext({
          ...projectContext,
          ...normalized,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            {isNew ? t("contexts.create") : t("contexts.edit")}
          </h1>
        </div>

        <div className="space-y-5">
          <Input
            label={t("contexts.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Projeto Alpha"
          />

          <TextArea
            label={t("contexts.description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("contexts.descriptionPlaceholder")}
            className="min-h-28"
          />

          <TextArea
            label={t("contexts.stakeholders")}
            value={stakeholders}
            onChange={(event) => setStakeholders(event.target.value)}
            placeholder={t("contexts.stakeholdersPlaceholder")}
            className="min-h-24"
          />

          <TextArea
            label={t("contexts.decisions")}
            value={decisions}
            onChange={(event) => setDecisions(event.target.value)}
            placeholder={t("contexts.decisionsPlaceholder")}
            className="min-h-24"
          />

          <TextArea
            label={t("contexts.links")}
            value={links}
            onChange={(event) => setLinks(event.target.value)}
            placeholder={t("contexts.linksPlaceholder")}
            className="min-h-24 font-mono text-xs"
          />

          <TextArea
            label={t("contexts.notes")}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("contexts.notesPlaceholder")}
            className="min-h-32"
          />

          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" onClick={handleSave} disabled={!normalized.name || saving}>
              <Save size={14} />
              {t("common.save")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
