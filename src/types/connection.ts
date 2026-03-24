export type ConnectionAuthType =
  | "oauth"
  | "api_key"
  | "password"
  | "cookie"
  | "browser_profile"
  | "manual";

export type ConnectionStatus =
  | "draft"
  | "pending_credentials"
  | "pending_login"
  | "ready"
  | "expired"
  | "error";

export type Connection = {
  id: string;
  provider: string;
  label: string;
  authType: ConnectionAuthType;
  secretRef?: string;
  browserProfileId?: string;
  loginUrl?: string;
  targetSite?: string;
  status: ConnectionStatus;
  lastValidatedAt?: number;
  createdAt: number;
  updatedAt: number;
};
