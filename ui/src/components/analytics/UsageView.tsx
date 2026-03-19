import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useUsageStore } from "../../stores/usageStore";
import Badge from "../shared/Badge";
import Spinner from "../shared/Spinner";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

function formatTimestamp(ts: number): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UsageView() {
  const { t } = useTranslation();
  const { stats, loading, error, loadUsage } = useUsageStore();

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  const statCards = [
    { label: t("usage.totalConversations", "Total Conversations"), value: formatNumber(stats.totalConversations) },
    { label: t("usage.totalMessages", "Total Messages"), value: formatNumber(stats.totalMessages) },
    { label: t("usage.estimatedTokens", "Estimated Tokens"), value: formatNumber(stats.estimatedTokens) },
    { label: t("usage.estimatedCost", "Estimated Cost"), value: formatCost(stats.estimatedCost) },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      {/* Header */}
      <h1 className="text-lg font-semibold text-text-primary">
        {t("usage.title", "Usage & Analytics")}
      </h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-bg-secondary border border-border rounded-xl p-4"
          >
            <p className="text-text-secondary text-xs">{card.label}</p>
            <p className="text-2xl font-semibold text-text-primary mt-1">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Usage by model */}
      {stats.byModel.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-text-primary mb-3">
            {t("usage.byModel", "Usage by Model")}
          </h2>
          <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left px-4 py-2 font-medium">
                    {t("usage.model", "Model")}
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    {t("usage.messages", "Messages")}
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    {t("usage.tokens", "Est. Tokens")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.byModel.map((row) => (
                  <tr key={row.model} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-text-primary">
                      <Badge color="blue">{row.model}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-text-primary">
                      {formatNumber(row.messages)}
                    </td>
                    <td className="px-4 py-2 text-right text-text-secondary">
                      {formatNumber(row.tokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent activity */}
      {stats.recentActivity.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-text-primary mb-3">
            {t("usage.recentActivity", "Recent Activity")}
          </h2>
          <div className="bg-bg-secondary border border-border rounded-xl divide-y divide-border">
            {stats.recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs text-text-primary truncate">
                    {item.title}
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {formatTimestamp(item.updatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Badge color="gray">{item.model}</Badge>
                  <span className="text-xs text-text-secondary">
                    {item.messageCount} {t("usage.msgs", "msgs")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
