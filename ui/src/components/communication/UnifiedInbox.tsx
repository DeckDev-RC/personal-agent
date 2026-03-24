import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Inbox, Mail, RefreshCw, Search } from "lucide-react";
import { getDraftChannel, type DraftType } from "../../../../src/types/communication.js";
import type { UnifiedInboxSnapshot } from "../../../../src/types/inbox.js";
import Badge from "../shared/Badge";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";
import Input from "../shared/Input";

const ALL_CHANNELS = "__all__";
const api = () => (window as any).codexAgent;

function formatRelativeTime(value?: number): string {
  if (!value) {
    return "Sem horario";
  }

  const deltaMs = Date.now() - value;
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (deltaMinutes < 1) {
    return "Agora";
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} h`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays} d`;
}

export default function UnifiedInbox() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<UnifiedInboxSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [channel, setChannel] = useState<string>(ALL_CHANNELS);

  async function loadInbox(silent = false) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const nextSnapshot = await api().inbox.list({
        limit: 24,
        onlyUnread,
        query: query.trim() || undefined,
        channel: channel === ALL_CHANNELS ? undefined : channel,
      });
      setSnapshot(nextSnapshot);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadInbox(false);
  }, [channel, onlyUnread, query]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadInbox(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [channel, onlyUnread, query]);

  const channelOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: Array<{ value: string; label: string }> = [{ value: ALL_CHANNELS, label: t("communication.allChannels", "Todos os canais") }];

    for (const item of snapshot?.sources ?? []) {
      if (seen.has(item.channel)) {
        continue;
      }
      seen.add(item.channel);
      values.push({
        value: item.channel,
        label: getDraftChannel(item.channel).label,
      });
    }

    return values;
  }, [snapshot?.sources, t]);

  const failingSources = useMemo(
    () => (snapshot?.sources ?? []).filter((source) => source.error),
    [snapshot?.sources],
  );

  if (loading && !snapshot) {
    return (
      <div className="flex h-full flex-col overflow-y-auto p-4">
        <EmptyState
          icon={Inbox}
          title={t("communication.loadingInbox", "Carregando inbox")}
          description={t("communication.loadingInboxDesc", "Consultando servidores MCP conectados para montar a caixa de entrada unificada.")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            {t("communication.inboxTitle", "Inbox unificado")}
          </h2>
          <p className="mt-1 text-xs text-text-secondary/70">
            {t("communication.inboxDesc", "Agrega mensagens e resultados de inbox dos MCPs conectados. Servidores com busca apenas sob demanda podem precisar de uma consulta.")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant={onlyUnread ? "primary" : "secondary"} size="sm" onClick={() => setOnlyUnread((value) => !value)}>
            {t("communication.onlyUnread", "Nao lidas")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void loadInbox(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>{refreshing ? t("common.loading", "Carregando...") : t("communication.refreshInbox", "Atualizar")}</span>
          </Button>
        </div>
      </div>

      <form
        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(queryDraft);
        }}
      >
        <Input
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
          placeholder={t("communication.inboxSearchPlaceholder", "Buscar por remetente, assunto ou termo para servidores search-only")}
        />
        <Button variant="secondary" size="sm" type="submit">
          <Search size={14} />
          <span>{t("common.search", "Buscar...")}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => {
            setQueryDraft("");
            setQuery("");
          }}
          disabled={!queryDraft && !query}
        >
          {t("communication.clearSearch", "Limpar")}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {channelOptions.map((option) => (
          <Button
            key={option.value}
            variant={channel === option.value ? "primary" : "secondary"}
            size="sm"
            onClick={() => setChannel(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {(snapshot?.sources?.length ?? 0) > 0 && (
        <div className="grid gap-2 xl:grid-cols-3">
          {(snapshot?.sources ?? []).map((source) => (
            <div key={source.serverId} className="rounded-lg border border-border bg-bg-secondary p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-text-primary">{source.serverName}</div>
                  <div className="mt-0.5 text-[11px] text-text-secondary/65">
                    {getDraftChannel(source.channel).label}
                    {source.toolName ? ` • ${source.toolName}` : ""}
                  </div>
                </div>
                <Badge color={source.error ? "red" : source.itemCount > 0 ? "green" : "gray"}>
                  {source.error ? t("common.error", "Erro") : `${source.itemCount}`}
                </Badge>
              </div>

              {source.error && (
                <div className="mt-2 text-[11px] leading-relaxed text-red-400/90">
                  {source.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {(snapshot?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={Mail}
          title={t("communication.emptyInbox", "Nenhuma mensagem encontrada")}
          description={
            failingSources.length > 0
              ? t("communication.emptyInboxWithErrors", "Os servidores conectados nao retornaram mensagens utilizaveis ou exigem uma consulta mais especifica.")
              : t("communication.emptyInboxDesc", "Conecte um MCP com ferramentas de inbox ou ajuste os filtros acima.")
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {(snapshot?.items ?? []).map((item) => (
            <div key={`${item.serverId}:${item.id}`} className="rounded-xl border border-border bg-bg-secondary p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">{item.title}</span>
                    <Badge color="gray">{getDraftChannel(item.channel).label}</Badge>
                    {item.unread === true && <Badge color="blue">{t("communication.unread", "Nao lida")}</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary/70">
                    {item.from && <span>{item.from}</span>}
                    <span>{item.serverName}</span>
                    <span>{formatRelativeTime(item.receivedAt)}</span>
                  </div>
                </div>

                {item.threadId && (
                  <Badge color="gray">{item.threadId}</Badge>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
                {item.snippet || item.rawText || t("communication.noPreview", "Sem preview textual.")}
              </p>

              {item.url && (
                <div className="mt-2 truncate text-[11px] text-accent-blue">
                  {item.url}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
