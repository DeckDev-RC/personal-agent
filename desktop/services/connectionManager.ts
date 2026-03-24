import { randomUUID } from "node:crypto";
import type { Connection, ConnectionStatus } from "../../src/types/connection.js";
import {
  deleteConnectionV2,
  getConnectionV2,
  listConnectionsV2,
  saveConnectionV2,
} from "./v2EntityStore.js";

export function resolveConnectionSessionId(connectionId: string): string {
  return `connection:${connectionId}`;
}

function normalizeConnectionStatus(partial: Partial<Connection>): ConnectionStatus {
  if (partial.status) {
    return partial.status;
  }
  if (partial.secretRef?.trim() || partial.browserProfileId?.trim()) {
    return "draft";
  }
  return partial.authType === "browser_profile" ? "pending_login" : "pending_credentials";
}

export function normalizeConnection(
  partial: Partial<Connection>,
  fallbackTimestamp = Date.now(),
): Connection {
  return {
    id: String(partial.id ?? randomUUID()),
    provider: partial.provider?.trim() || "custom",
    label: partial.label?.trim() || "Nova conexao",
    authType: partial.authType ?? "manual",
    secretRef: partial.secretRef?.trim() || undefined,
    browserProfileId: partial.browserProfileId?.trim() || undefined,
    loginUrl: partial.loginUrl?.trim() || undefined,
    targetSite: partial.targetSite?.trim() || undefined,
    status: normalizeConnectionStatus(partial),
    lastValidatedAt:
      typeof partial.lastValidatedAt === "number" ? partial.lastValidatedAt : undefined,
    createdAt: Number(partial.createdAt ?? fallbackTimestamp),
    updatedAt: Number(partial.updatedAt ?? fallbackTimestamp),
  };
}

export function summarizeConnection(connection: Connection): string {
  const details = [connection.provider, connection.authType, connection.status];
  if (connection.targetSite) {
    details.push(connection.targetSite);
  }
  return `- ${connection.label} (${details.join(", ")}) [${connection.id}]`;
}

export async function listConnections(): Promise<Connection[]> {
  return await listConnectionsV2();
}

export async function getConnection(connectionId: string): Promise<Connection | null> {
  return await getConnectionV2(connectionId);
}

export async function saveConnection(connection: Connection): Promise<Connection> {
  const normalized = normalizeConnection(connection, connection.updatedAt ?? Date.now());
  await saveConnectionV2(normalized);
  return normalized;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await deleteConnectionV2(connectionId);
}

export async function ensureConnectionBrowserProfile(
  connectionId: string,
): Promise<Connection> {
  const existing = await getConnectionV2(connectionId);
  if (!existing) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  if (existing.authType !== "browser_profile" || existing.browserProfileId?.trim()) {
    return existing;
  }

  const now = Date.now();
  const next = normalizeConnection(
    {
      ...existing,
      browserProfileId: resolveConnectionSessionId(connectionId),
      updatedAt: now,
    },
    now,
  );
  await saveConnectionV2(next);
  return next;
}

export async function markConnectionValidated(params: {
  connectionId: string;
  status?: ConnectionStatus;
  browserProfileId?: string;
  secretRef?: string;
}): Promise<Connection> {
  const existing = await getConnectionV2(params.connectionId);
  if (!existing) {
    throw new Error(`Connection not found: ${params.connectionId}`);
  }

  const now = Date.now();
  const next = normalizeConnection(
    {
      ...existing,
      status: params.status ?? "ready",
      browserProfileId:
        params.browserProfileId ??
        existing.browserProfileId ??
        (existing.authType === "browser_profile"
          ? resolveConnectionSessionId(params.connectionId)
          : undefined),
      secretRef: params.secretRef ?? existing.secretRef,
      lastValidatedAt: now,
      updatedAt: now,
    },
    now,
  );
  await saveConnectionV2(next);
  return next;
}
