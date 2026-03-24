import React, { useEffect, useState, useCallback } from "react";
import { Package, Download, Trash2, Power, PowerOff, ExternalLink } from "lucide-react";
import type { PluginManifest, PluginRecord, PluginRegistryEntry } from "../../../../src/types/plugin.js";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";

const api = () => (window as any).codexAgent;

type Tab = "installed" | "marketplace";

const MARKETPLACE_ENTRIES: PluginRegistryEntry[] = [
  {
    id: "plugin-github-integration",
    name: "GitHub Integration",
    version: "1.0.0",
    description: "Full GitHub integration with issues, PRs, code review and actions management.",
    author: "Codex Community",
    downloadUrl: "",
    tags: ["dev", "github"],
    downloads: 1240,
    rating: 4.8,
  },
  {
    id: "plugin-notion-sync",
    name: "Notion Sync",
    version: "1.0.0",
    description: "Sync your Notion databases, pages and blocks bidirectionally.",
    author: "Codex Community",
    downloadUrl: "",
    tags: ["productivity", "notion"],
    downloads: 890,
    rating: 4.6,
  },
  {
    id: "plugin-slack-assistant",
    name: "Slack Assistant",
    version: "1.0.0",
    description: "AI-powered Slack bot that can respond to messages, manage channels and automate workflows.",
    author: "Codex Community",
    downloadUrl: "",
    tags: ["messaging", "slack"],
    downloads: 2100,
    rating: 4.9,
  },
  {
    id: "plugin-calendar-manager",
    name: "Calendar Manager",
    version: "1.0.0",
    description: "Manage Google Calendar events, create meetings and set reminders automatically.",
    author: "Codex Community",
    downloadUrl: "",
    tags: ["calendar", "productivity"],
    downloads: 760,
    rating: 4.5,
  },
  {
    id: "plugin-code-reviewer",
    name: "Code Reviewer",
    version: "1.0.0",
    description: "Automated code review with AI-powered suggestions and best practices enforcement.",
    author: "Codex Community",
    downloadUrl: "",
    tags: ["dev", "code-review"],
    downloads: 3200,
    rating: 4.7,
  },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, "green" | "blue" | "gray" | "red"> = {
    active: "green",
    installed: "blue",
    disabled: "gray",
    error: "red",
  };
  return (
    <Badge color={colors[status] ?? colors.disabled} className="rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]">
      {status}
    </Badge>
  );
}

function PluginCard({
  plugin,
  onActivate,
  onDeactivate,
  onUninstall,
}: {
  plugin: PluginRecord;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onUninstall: (id: string) => void;
}) {
  const m = plugin.manifest;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-secondary/80 p-4 shadow-sm transition-colors hover:bg-bg-secondary">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Package size={18} className="shrink-0 text-accent-blue" />
          <span className="truncate text-sm font-semibold text-text-primary">{m.name}</span>
          <span className="text-[10px] text-text-secondary/70">v{m.version}</span>
        </div>
        <StatusBadge status={plugin.status} />
      </div>

      <p className="line-clamp-2 text-xs leading-relaxed text-text-secondary/80">{m.description}</p>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-text-secondary/70">
        <span>by {m.author}</span>
        {(m.mcpServers?.length ?? 0) > 0 && <span>{m.mcpServers!.length} MCP server{m.mcpServers!.length > 1 ? "s" : ""}</span>}
        {(m.skills?.length ?? 0) > 0 && <span>{m.skills!.length} skill{m.skills!.length > 1 ? "s" : ""}</span>}
      </div>

      {m.tags && m.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {m.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-border bg-bg-tertiary px-1.5 py-0.5 text-[9px] font-medium text-text-secondary/80"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {plugin.error && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-400">
          {plugin.error}
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {plugin.status === "active" ? (
          <Button
            onClick={() => onDeactivate(plugin.id)}
            size="sm"
            variant="secondary"
            className="border-transparent bg-accent-orange/12 text-accent-orange hover:bg-accent-orange/18"
          >
            <PowerOff size={12} /> Desativar
          </Button>
        ) : (
          <Button
            onClick={() => onActivate(plugin.id)}
            size="sm"
            variant="secondary"
            className="border-transparent bg-accent-green/12 text-accent-green hover:bg-accent-green/18"
          >
            <Power size={12} /> Ativar
          </Button>
        )}
        <Button
          onClick={() => onUninstall(plugin.id)}
          size="sm"
          variant="danger"
        >
          <Trash2 size={12} /> Remover
        </Button>
        {m.homepage && (
          <a
            href={m.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-bg-tertiary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-bg-primary/60 hover:text-text-primary"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

function MarketplaceCard({
  entry,
  installed,
  onInstall,
}: {
  entry: PluginRegistryEntry;
  installed: boolean;
  onInstall: (entry: PluginRegistryEntry) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-secondary/80 p-4 shadow-sm transition-colors hover:bg-bg-secondary">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Package size={18} className="shrink-0 text-accent-orange" />
          <span className="truncate text-sm font-semibold text-text-primary">{entry.name}</span>
          <span className="text-[10px] text-text-secondary/70">v{entry.version}</span>
        </div>
      </div>

      <p className="line-clamp-2 text-xs leading-relaxed text-text-secondary/80">{entry.description}</p>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-text-secondary/70">
        <span>by {entry.author}</span>
        <span>{entry.downloads.toLocaleString()} downloads</span>
        <span>&#9733; {entry.rating}</span>
      </div>

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-border bg-bg-tertiary px-1.5 py-0.5 text-[9px] font-medium text-text-secondary/80"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-1">
        {installed ? (
          <Badge color="green" className="px-2 py-1 text-[11px]">
            Instalado
          </Badge>
        ) : (
          <Button
            onClick={() => onInstall(entry)}
            size="sm"
            variant="secondary"
            className="border-transparent bg-accent-blue/12 text-accent-blue hover:bg-accent-blue/18"
          >
            <Download size={12} /> Instalar
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PluginManager() {
  const [tab, setTab] = useState<Tab>("installed");
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlugins = useCallback(async () => {
    try {
      const list = await api().plugins.list();
      setPlugins(Array.isArray(list) ? list : []);
    } catch {
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const handleActivate = async (id: string) => {
    try {
      await api().plugins.activate(id);
      await loadPlugins();
    } catch (err: any) {
      console.error("Failed to activate plugin:", err);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api().plugins.deactivate(id);
      await loadPlugins();
    } catch (err: any) {
      console.error("Failed to deactivate plugin:", err);
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      await api().plugins.uninstall(id);
      await loadPlugins();
    } catch (err: any) {
      console.error("Failed to uninstall plugin:", err);
    }
  };

  const handleInstallFromMarketplace = async (entry: PluginRegistryEntry) => {
    const manifest: PluginManifest = {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      description: entry.description,
      author: entry.author,
      tags: entry.tags,
    };
    try {
      await api().plugins.install(manifest);
      await loadPlugins();
    } catch (err: any) {
      console.error("Failed to install plugin:", err);
    }
  };

  const installedIds = new Set(plugins.map((p) => p.id));

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-accent-blue" />
          <h1 className="text-lg font-semibold text-text-primary">Plugins</h1>
        </div>
        <Badge color="gray">{plugins.length} instalados</Badge>
      </div>

      <div className="flex w-fit gap-1 rounded-xl border border-border bg-bg-secondary/70 p-1">
        <button
          onClick={() => setTab("installed")}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
            tab === "installed"
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-secondary hover:bg-bg-primary/40 hover:text-text-primary"
          }`}
        >
          Instalados ({plugins.length})
        </button>
        <button
          onClick={() => setTab("marketplace")}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
            tab === "marketplace"
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-secondary hover:bg-bg-primary/40 hover:text-text-primary"
          }`}
        >
          Marketplace
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-text-secondary">
          Carregando plugins...
        </div>
      ) : tab === "installed" ? (
        plugins.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nenhum plugin instalado."
            description="Visite o Marketplace para instalar plugins."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {plugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onActivate={handleActivate}
                onDeactivate={handleDeactivate}
                onUninstall={handleUninstall}
              />
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {MARKETPLACE_ENTRIES.map((entry) => (
            <MarketplaceCard
              key={entry.id}
              entry={entry}
              installed={installedIds.has(entry.id)}
              onInstall={handleInstallFromMarketplace}
            />
          ))}
        </div>
      )}
    </div>
  );
}
