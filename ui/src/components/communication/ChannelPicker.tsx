import React, { useEffect, useMemo } from "react";
import { getDraftChannel, listDraftChannels, type DraftType } from "../../../../src/types/communication.js";
import { useMcpStore } from "../../stores/mcpStore";
import Select from "../shared/Select";

type ChannelPickerProps = {
  type: DraftType;
  mcpServerId?: string;
  onTypeChange: (type: DraftType) => void;
  onMcpServerIdChange: (serverId?: string) => void;
};

const AUTO_SERVER_VALUE = "__auto__";

export default function ChannelPicker({
  type,
  mcpServerId,
  onTypeChange,
  onMcpServerIdChange,
}: ChannelPickerProps) {
  const { servers, loaded, loadServers } = useMcpStore();

  useEffect(() => {
    if (!loaded) {
      void loadServers();
    }
  }, [loaded, loadServers]);

  const channel = useMemo(() => getDraftChannel(type), [type]);
  const typeOptions = useMemo(
    () => listDraftChannels().map((item) => ({ value: item.type, label: item.label })),
    [],
  );
  const serverOptions = useMemo(() => {
    const preferredCatalogIds = new Set(channel.preferredCatalogIds);
    const sorted = [...servers]
      .filter((server) => server.enabled)
      .sort((left, right) => {
        const leftPreferred = preferredCatalogIds.has(left.catalogId ?? "") ? 1 : 0;
        const rightPreferred = preferredCatalogIds.has(right.catalogId ?? "") ? 1 : 0;
        return rightPreferred - leftPreferred || left.name.localeCompare(right.name);
      });

    return [
      { value: AUTO_SERVER_VALUE, label: "Auto-select best MCP server" },
      ...sorted.map((server) => ({
        value: server.id,
        label: preferredCatalogIds.has(server.catalogId ?? "")
          ? `${server.name} (recommended)`
          : server.name,
      })),
    ];
  }, [channel.preferredCatalogIds, servers]);

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <Select
        label="Channel"
        value={type}
        onChange={(value) => onTypeChange(value as DraftType)}
        options={typeOptions}
      />
      <Select
        label="MCP server"
        value={mcpServerId ?? AUTO_SERVER_VALUE}
        onChange={(value) => onMcpServerIdChange(value === AUTO_SERVER_VALUE ? undefined : value)}
        options={serverOptions}
      />
      <div className="md:col-span-2 text-[11px] text-text-secondary/65">
        If you leave this on auto, delivery tries the best matching connected MCP server for the selected channel.
      </div>
    </div>
  );
}
