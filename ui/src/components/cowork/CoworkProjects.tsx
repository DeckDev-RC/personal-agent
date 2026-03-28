import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, FolderOpen } from "lucide-react";
import { useCoworkStore } from "../../stores/coworkStore.js";
import { useContextStore } from "../../stores/contextStore.js";
import ProjectCard from "./ProjectCard.js";
import Modal from "../shared/Modal.js";
import Input from "../shared/Input.js";
import Select from "../shared/Select.js";
import Button from "../shared/Button.js";
import { setRoute } from "../../router.js";

export default function CoworkProjects() {
  const { t } = useTranslation();
  const { projects, loadProjects, createProject, deleteProject } = useCoworkStore();
  const { contexts, loadContexts } = useContextStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [contextId, setContextId] = useState("");

  useEffect(() => {
    void loadProjects();
    void loadContexts();
  }, [loadProjects, loadContexts]);

  const handleCreate = async () => {
    if (!name.trim() || !contextId) return;
    await createProject(name.trim(), contextId);
    setName("");
    setContextId("");
    setShowCreate(false);
  };

  const active = projects.filter((p) => p.status === "active");
  const paused = projects.filter((p) => p.status === "paused");
  const completed = projects.filter((p) => p.status === "completed");

  const renderSection = (label: string, items: typeof projects) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => setRoute("contexts")}
              onDelete={() => deleteProject(project.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("cowork.projects.title", "Projetos")}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          {t("cowork.projects.new", "Novo Projeto")}
        </button>
      </div>

      {projects.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FolderOpen size={32} className="text-text-secondary/50" />
          <p className="text-sm text-text-secondary">
            {t("cowork.projects.empty", "Nenhum projeto criado")}
          </p>
        </div>
      )}

      {renderSection(t("cowork.projects.active", "Ativos"), active)}
      {renderSection(t("cowork.projects.paused", "Pausados"), paused)}
      {renderSection(t("cowork.projects.completed", "Concluidos"), completed)}

      {showCreate && (
        <Modal title={t("cowork.projects.newTitle", "Novo Projeto")} onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <Input
              placeholder={t("cowork.projects.namePlaceholder", "Nome do projeto")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              value={contextId}
              onChange={(val) => setContextId(val)}
              options={[
                { value: "", label: t("cowork.projects.selectContext", "Selecione um contexto") },
                ...contexts.map((ctx) => ({ value: ctx.id, label: ctx.name })),
              ]}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>{t("common.cancel", "Cancelar")}</Button>
              <Button onClick={handleCreate}>{t("common.create", "Criar")}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
