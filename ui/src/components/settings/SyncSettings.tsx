import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, FolderSync, Download, Upload, CheckCircle } from "lucide-react";
import Button from "../shared/Button";
import Input from "../shared/Input";
import Toggle from "../shared/Toggle";

const api = () => (window as any).codexAgent;

type SyncConfig = {
  enabled: boolean;
  syncPath: string;
  syncEntities: {
    agents: boolean;
    skills: boolean;
    workflows: boolean;
    contexts: boolean;
    tasks: boolean;
  };
  lastSyncAt?: number;
};

export default function SyncSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SyncConfig>({
    enabled: false,
    syncPath: "",
    syncEntities: { agents: true, skills: true, workflows: true, contexts: true, tasks: true },
  });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api().sync.getConfig().then(setConfig).catch(() => {});
  }, []);

  async function handleSave() {
    await api().sync.updateConfig(config);
    setMessage(t("sync.saved", "Configuração salva"));
    setTimeout(() => setMessage(null), 2000);
  }

  async function handleExport() {
    setSyncing(true);
    try {
      const result = await api().sync.export();
      setMessage(t("sync.exported", `Exportados ${result.exported} itens`));
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleImport() {
    setSyncing(true);
    try {
      const result = await api().sync.import();
      setMessage(t("sync.imported", `Importados ${result.imported} itens`));
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  const entityKeys = ["agents", "skills", "workflows", "contexts", "tasks"] as const;
  const entityLabels: Record<string, string> = {
    agents: "Agentes",
    skills: "Skills",
    workflows: "Workflows",
    contexts: "Contextos",
    tasks: "Tarefas",
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <FolderSync size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">
          {t("sync.title", "Sincronização")}
        </h2>
      </div>

      <div>
        <label className="text-xs text-text-secondary mb-1 block">{t("sync.path", "Pasta de sincronização")}</label>
        <Input
          value={config.syncPath}
          onChange={(v) => setConfig({ ...config, syncPath: v })}
          placeholder="C:/Users/.../OneDrive/OpenClaw"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-text-secondary">{t("sync.entities", "Entidades para sincronizar")}</span>
        {entityKeys.map((key) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-text-primary">{entityLabels[key]}</span>
            <Toggle
              checked={config.syncEntities[key]}
              onChange={(v) =>
                setConfig({
                  ...config,
                  syncEntities: { ...config.syncEntities, [key]: v },
                })
              }
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleSave}>
          <CheckCircle size={14} />
          <span>{t("common.save", "Salvar")}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleExport} disabled={syncing || !config.syncPath}>
          <Upload size={14} />
          <span>{t("sync.export", "Exportar")}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleImport} disabled={syncing || !config.syncPath}>
          <Download size={14} />
          <span>{t("sync.import", "Importar")}</span>
        </Button>
      </div>

      {message && (
        <div className="text-xs text-accent bg-accent/10 rounded-lg px-3 py-2">{message}</div>
      )}

      {config.lastSyncAt && (
        <p className="text-[10px] text-text-secondary/50">
          {t("sync.lastSync", "Última sync")}: {new Date(config.lastSyncAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
