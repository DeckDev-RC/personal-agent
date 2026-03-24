import type { ProviderAuthStatus } from "../../../../src/types/model.js";

export function getStatusBarConnectionLabel(status?: ProviderAuthStatus): {
  labelKey: string;
  fallback: string;
} {
  if (!status) {
    return {
      labelKey: "statusBar.connectionUnknown",
      fallback: "Conexão indisponível",
    };
  }

  if (status.authKind === "oauth") {
    return status.authenticated
      ? {
          labelKey: "statusBar.oauthConnected",
          fallback: "OAuth conectado",
        }
      : {
          labelKey: "statusBar.oauthDisconnected",
          fallback: "OAuth desconectado",
        };
  }

  if (status.authKind === "apiKey") {
    return status.configured
      ? {
          labelKey: "statusBar.apiKeyConfigured",
          fallback: "API key configurada",
        }
      : {
          labelKey: "statusBar.apiKeyMissing",
          fallback: "API key pendente",
        };
  }

  return status.authenticated
    ? {
        labelKey: "statusBar.localReady",
        fallback: "Runtime local pronto",
      }
    : {
        labelKey: "statusBar.localUnavailable",
        fallback: "Runtime local indisponível",
      };
}
