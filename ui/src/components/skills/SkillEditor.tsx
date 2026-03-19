import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save, X } from "lucide-react";
import { useSkillStore, type Skill } from "../../stores/skillStore";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { TextArea } from "../shared/Input";

type SkillEditorProps = {
  skill?: Skill;
  onClose: () => void;
};

export default function SkillEditor({ skill, onClose }: SkillEditorProps) {
  const { t } = useTranslation();
  const { createSkill, updateSkill } = useSkillStore();
  const isNew = !skill;

  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [content, setContent] = useState(skill?.content ?? "");
  const [type, setType] = useState<"prompt" | "tool">(skill?.type ?? "prompt");
  const [tagsInput, setTagsInput] = useState(skill?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  function parseTags(input: string): string[] {
    return input
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const tags = parseTags(tagsInput);
      if (isNew) {
        await createSkill({
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
          type,
          tags,
        });
      } else {
        await updateSkill({
          ...skill,
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
          type,
          tags,
          updatedAt: Date.now(),
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
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            {isNew ? t("skills.create") : t("skills.edit")}
          </h1>
        </div>

        <div className="space-y-5">
          {/* Name */}
          <Input
            label={t("skills.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Revisor de Código, Tradutor, Resumidor..."
          />

          {/* Description */}
          <Input
            label={t("skills.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que esta skill faz..."
          />

          {/* Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary font-medium">{t("skills.type")}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType("prompt")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  type === "prompt"
                    ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/30"
                    : "bg-white/5 text-text-secondary border border-border hover:text-text-primary"
                }`}
              >
                {t("skills.prompt")}
              </button>
              <button
                onClick={() => setType("tool")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  type === "tool"
                    ? "bg-accent-orange/20 text-accent-orange border border-accent-orange/30"
                    : "bg-white/5 text-text-secondary border border-border hover:text-text-primary"
                }`}
              >
                {t("skills.tool")}
              </button>
            </div>
            <p className="text-[10px] text-text-secondary/50 mt-1">
              {type === "prompt"
                ? "Skills do tipo prompt são adicionadas ao system prompt do agente."
                : "Skills do tipo tool definem ferramentas que o modelo pode chamar (futuro)."}
            </p>
          </div>

          {/* Tags */}
          <Input
            label={t("skills.tags")}
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="código, revisão, tradução (separadas por vírgula)"
          />

          {/* Content */}
          <TextArea
            label={t("skills.content")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              type === "prompt"
                ? "Instruções markdown que serão injetadas no system prompt..."
                : "Definição JSON da ferramenta..."
            }
            className="min-h-56 font-mono text-xs leading-relaxed"
          />

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" onClick={handleSave} disabled={!name.trim() || saving}>
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
