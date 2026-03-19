import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Zap, Pencil, Trash2, Tag, Download, Upload } from "lucide-react";
import { useSkillStore, type Skill } from "../../stores/skillStore";
import Button from "../shared/Button";
import Badge from "../shared/Badge";
import SkillEditor from "./SkillEditor";

export default function SkillListView() {
  const { t } = useTranslation();
  const { skills, loaded, loadSkills, deleteSkill, importSkills, exportSkills } = useSkillStore();
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) loadSkills();
  }, [loaded, loadSkills]);

  const allTags = Array.from(new Set(skills.flatMap((s) => s.tags))).sort();

  const filtered = filterTag
    ? skills.filter((s) => s.tags.includes(filterTag))
    : skills;

  if (editing || creating) {
    return (
      <SkillEditor
        skill={editing ?? undefined}
        onClose={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-text-primary">{t("skills.title")}</h1>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => importSkills()}>
              <Upload size={14} />
              {t("skills.import")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportSkills()}>
              <Download size={14} />
              {t("skills.export")}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} />
              {t("skills.create")}
            </Button>
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              onClick={() => setFilterTag(null)}
              className={`px-2 py-0.5 rounded-md text-xs cursor-pointer transition-colors ${
                !filterTag ? "bg-accent-blue/20 text-accent-blue" : "bg-white/5 text-text-secondary hover:text-text-primary"
              }`}
            >
              Todas
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                className={`px-2 py-0.5 rounded-md text-xs cursor-pointer transition-colors ${
                  tag === filterTag ? "bg-accent-blue/20 text-accent-blue" : "bg-white/5 text-text-secondary hover:text-text-primary"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-text-secondary text-sm">
            {t("skills.noSkills")}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((skill) => (
              <div
                key={skill.id}
                className="group flex items-start gap-4 rounded-xl border border-border bg-bg-secondary p-4 hover:border-white/10 transition-colors"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-accent-orange/10 text-accent-orange flex items-center justify-center mt-0.5">
                  <Zap size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {skill.name}
                    </span>
                    <Badge color={skill.type === "prompt" ? "blue" : "orange"}>
                      {skill.type}
                    </Badge>
                  </div>
                  {skill.description && (
                    <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                  {skill.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {skill.tags.map((tag) => (
                        <span key={tag} className="flex items-center gap-0.5 text-[10px] text-text-secondary/60">
                          <Tag size={8} /> {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-[10px] text-text-secondary/50 truncate font-mono">
                    {skill.content.slice(0, 120)}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => setEditing(skill)}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteSkill(skill.id)}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
