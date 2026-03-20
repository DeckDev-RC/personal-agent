import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, FolderTree, RefreshCw } from "lucide-react";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";

type CoworkCategory = "meetings" | "drafts" | "research" | "tasks";

type WorkspaceFileEntry = {
  name: string;
  title: string;
  category: CoworkCategory;
  relativePath: string;
  absolutePath: string;
  updatedAt: number;
  sizeBytes: number;
  preview: string;
  sessionId?: string;
  runId?: string;
  projectContextId?: string;
  skillId?: string;
  skillName?: string;
};

type WorkspaceSnapshot = {
  rootPath: string;
  categories: Array<{
    id: CoworkCategory;
    label: string;
    absolutePath: string;
    fileCount: number;
  }>;
  files: WorkspaceFileEntry[];
};

type WorkspaceDocument = WorkspaceFileEntry & {
  content: string;
};

const api = () => (window as any).codexAgent;

type WorkspaceExplorerProps = {
  initialSelectedPath?: string;
};

export default function WorkspaceExplorer({ initialSelectedPath }: WorkspaceExplorerProps) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<WorkspaceDocument | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | CoworkCategory>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);

  async function loadWorkspace() {
    setLoading(true);
    const nextSnapshot = await api().cowork.workspace();
    setSnapshot(nextSnapshot);
    setLoading(false);
    setSelectedPath((current) => {
      if (current && nextSnapshot.files.some((file: WorkspaceFileEntry) => file.relativePath === current)) {
        return current;
      }
      return nextSnapshot.files[0]?.relativePath ?? "";
    });
  }

  async function loadFile(relativePath: string) {
    if (!relativePath) {
      setSelectedFile(null);
      return;
    }
    setLoadingFile(true);
    const nextFile = await api().cowork.file(relativePath);
    setSelectedFile(nextFile);
    setLoadingFile(false);
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!initialSelectedPath) {
      return;
    }
    setSelectedPath(initialSelectedPath);
  }, [initialSelectedPath]);

  useEffect(() => {
    if (selectedPath) {
      void loadFile(selectedPath);
      return;
    }
    setSelectedFile(null);
  }, [selectedPath]);

  const filteredFiles = useMemo(() => {
    const files = snapshot?.files ?? [];
    const normalizedQuery = search.trim().toLowerCase();
    return files.filter((file) => {
      if (categoryFilter !== "all" && file.category !== categoryFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [file.title, file.preview, file.skillName, file.relativePath]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [categoryFilter, search, snapshot?.files]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-border bg-bg-secondary/70 px-6 py-16 text-center text-sm text-text-secondary">
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-2xl border border-border bg-bg-secondary/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <FolderTree size={18} className="text-accent-blue" />
                {t("workspace.title")}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-text-secondary/75">
                {t("workspace.subtitle")}
              </p>
              <div className="mt-3 text-xs text-text-secondary/60">
                {t("workspace.rootLabel")}: <span className="text-text-primary">{snapshot?.rootPath ?? "-"}</span>
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => void loadWorkspace()}>
              <RefreshCw size={14} />
              {t("workspace.refresh")}
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-border bg-bg-primary px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                {t("workspace.totalFiles")}
              </div>
              <div className="mt-1 text-lg text-text-primary">{snapshot?.files.length ?? 0}</div>
            </div>

            {(snapshot?.categories ?? []).map((category) => (
              <button
                key={category.id}
                onClick={() => setCategoryFilter(category.id)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                  categoryFilter === category.id
                    ? "border-accent-blue/30 bg-accent-blue/10"
                    : "border-border bg-bg-primary hover:bg-white/5"
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.12em] text-text-secondary/55">
                  {t(`workspace.categories.${category.id}`)}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-sm text-text-primary">{category.fileCount}</span>
                  <Badge color={categoryFilter === category.id ? "blue" : "gray"}>{category.label}</Badge>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[360px,minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-bg-secondary/70 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("workspace.searchPlaceholder")}
                  className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-blue/40"
                />
                <Button
                  variant={categoryFilter === "all" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setCategoryFilter("all")}
                >
                  {t("workspace.categories.all")}
                </Button>
              </div>

              {filteredFiles.length === 0 ? (
                <EmptyState
                  icon={<FileText size={18} />}
                  title={t("workspace.emptyTitle")}
                  description={t("workspace.emptyDescription")}
                />
              ) : (
                <div className="space-y-2">
                  {filteredFiles.map((file) => (
                    <button
                      key={file.relativePath}
                      onClick={() => setSelectedPath(file.relativePath)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors cursor-pointer ${
                        selectedPath === file.relativePath
                          ? "border-accent-blue/30 bg-accent-blue/10"
                          : "border-border bg-bg-primary hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-primary">{file.title}</div>
                          <div className="mt-1 truncate text-[11px] text-text-secondary/55">{file.relativePath}</div>
                        </div>
                        <Badge color="gray">{t(`workspace.categories.${file.category}`)}</Badge>
                      </div>
                      <div className="mt-2 text-xs leading-relaxed text-text-secondary/75 line-clamp-3">
                        {file.preview}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-text-secondary/55">
                        {file.skillName && <span>{file.skillName}</span>}
                        <span>{new Date(file.updatedAt).toLocaleString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg-secondary/70">
            {!selectedPath ? (
              <EmptyState
                icon={<FileText size={18} />}
                title={t("workspace.previewEmptyTitle")}
                description={t("workspace.previewEmptyDescription")}
              />
            ) : loadingFile ? (
              <div className="px-6 py-16 text-center text-sm text-text-secondary">{t("common.loading")}</div>
            ) : selectedFile ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-text-primary">{selectedFile.title}</h2>
                      <div className="mt-1 text-xs text-text-secondary/60">{selectedFile.relativePath}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge color="blue">{t(`workspace.categories.${selectedFile.category}`)}</Badge>
                      {selectedFile.skillName && <Badge color="gray">{selectedFile.skillName}</Badge>}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-text-secondary/60">
                    <span>{t("workspace.updatedAt")}: {new Date(selectedFile.updatedAt).toLocaleString()}</span>
                    <span>{t("workspace.fileSize")}: {selectedFile.sizeBytes.toLocaleString()} B</span>
                    {selectedFile.projectContextId && (
                      <span>{t("workspace.contextLabel")}: {selectedFile.projectContextId}</span>
                    )}
                  </div>
                </div>

                <pre className="flex-1 overflow-auto px-5 py-4 text-[12px] leading-relaxed text-text-secondary whitespace-pre-wrap">
                  {selectedFile.content}
                </pre>
              </div>
            ) : (
              <EmptyState
                icon={<FileText size={18} />}
                title={t("workspace.previewEmptyTitle")}
                description={t("workspace.previewEmptyDescription")}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
