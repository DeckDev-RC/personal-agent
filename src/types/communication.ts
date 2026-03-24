export type DraftType =
  | "email"
  | "slack"
  | "teams"
  | "discord"
  | "telegram"
  | "whatsapp"
  | "signal"
  | "sms"
  | "generic";
export type DraftStatus = "draft" | "sent" | "failed";

export type DraftChannelDefinition = {
  type: DraftType;
  label: string;
  addressLabel: string;
  addressPlaceholder: string;
  requiresSubject: boolean;
  preferredCatalogIds: string[];
};

const DRAFT_CHANNELS: DraftChannelDefinition[] = [
  {
    type: "email",
    label: "Email",
    addressLabel: "Recipient",
    addressPlaceholder: "name@example.com",
    requiresSubject: true,
    preferredCatalogIds: ["gmail"],
  },
  {
    type: "slack",
    label: "Slack",
    addressLabel: "Channel or user",
    addressPlaceholder: "#team-updates or @debora",
    requiresSubject: false,
    preferredCatalogIds: ["slack"],
  },
  {
    type: "teams",
    label: "Teams",
    addressLabel: "Channel or user",
    addressPlaceholder: "General or @debora",
    requiresSubject: false,
    preferredCatalogIds: ["microsoft-teams-bridge"],
  },
  {
    type: "discord",
    label: "Discord",
    addressLabel: "Channel or user",
    addressPlaceholder: "#announcements or @debora",
    requiresSubject: false,
    preferredCatalogIds: ["discord-bridge"],
  },
  {
    type: "telegram",
    label: "Telegram",
    addressLabel: "Chat or user",
    addressPlaceholder: "@debora or chat id",
    requiresSubject: false,
    preferredCatalogIds: ["telegram-bridge"],
  },
  {
    type: "whatsapp",
    label: "WhatsApp",
    addressLabel: "Phone or group",
    addressPlaceholder: "+55 11 99999-9999",
    requiresSubject: false,
    preferredCatalogIds: ["whatsapp-bridge"],
  },
  {
    type: "signal",
    label: "Signal",
    addressLabel: "Phone or group",
    addressPlaceholder: "+55 11 99999-9999",
    requiresSubject: false,
    preferredCatalogIds: ["signal-bridge"],
  },
  {
    type: "sms",
    label: "SMS",
    addressLabel: "Phone number",
    addressPlaceholder: "+55 11 99999-9999",
    requiresSubject: false,
    preferredCatalogIds: ["twilio-sms-bridge"],
  },
  {
    type: "generic",
    label: "Generic",
    addressLabel: "Destination",
    addressPlaceholder: "Target destination",
    requiresSubject: true,
    preferredCatalogIds: [],
  },
];

export function listDraftChannels(): DraftChannelDefinition[] {
  return [...DRAFT_CHANNELS];
}

export function getDraftChannel(type?: string | null): DraftChannelDefinition {
  const normalized = String(type ?? "").trim().toLowerCase();
  return DRAFT_CHANNELS.find((channel) => channel.type === normalized) ?? DRAFT_CHANNELS[DRAFT_CHANNELS.length - 1];
}

export type DraftRecord = {
  id: string;
  type: DraftType;
  to: string;
  subject: string;
  body: string;
  status: DraftStatus;
  mcpServerId?: string;
  projectContextId?: string;
  sessionId?: string;
  attachments?: string[];
  sentAt?: number;
  createdAt: number;
  updatedAt: number;
};
