export type BrowserProfileId = string;

export type BrowserTargetId = string;

export type BrowserSnapshotFormat = "ai" | "aria" | "role";

export type BrowserRefMode = "role" | "aria";

export type BrowserImageType = "png" | "jpeg";

export type BrowserRoleRef = {
  role: string;
  name?: string;
  nth?: number;
};

export type BrowserSnapshotStats = {
  lines: number;
  chars: number;
  refs: number;
  interactive: number;
};

export type BrowserSnapshotAriaNode = {
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  depth: number;
};

export type BrowserSourceLocation = {
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
};

export type BrowserConsoleLevel =
  | "debug"
  | "info"
  | "log"
  | "warning"
  | "error";

export type BrowserConsoleEntry = {
  level: BrowserConsoleLevel;
  text: string;
  location?: BrowserSourceLocation;
  timestamp: number;
};

export type BrowserPageErrorEntry = {
  message: string;
  stack?: string;
  timestamp: number;
};

export type BrowserRequestEntry = {
  id?: string;
  url: string;
  method: string;
  resourceType?: string;
  status?: number;
  ok?: boolean;
  failureText?: string;
  timestamp: number;
};

export type BrowserRequestBase = {
  connectionId?: string;
  profile?: BrowserProfileId;
  targetId?: BrowserTargetId;
  selector?: string;
  ref?: string;
  frame?: string;
  timeoutMs?: number;
};

export type BrowserFormField = {
  selector?: string;
  ref?: string;
  type?: string;
  value?: string | number | boolean;
};

export type BrowserSnapshotRequest = BrowserRequestBase & {
  snapshotFormat?: BrowserSnapshotFormat;
  refs?: BrowserRefMode;
  labels?: boolean;
  limit?: number;
  maxChars?: number;
};

export type BrowserTabsRequest = Pick<BrowserRequestBase, "connectionId" | "profile">;

export type BrowserBatchActionRequest =
  | (BrowserRequestBase & {
      kind: "click";
      button?: string;
      doubleClick?: boolean;
      modifiers?: string[];
      delayMs?: number;
    })
  | (BrowserRequestBase & {
      kind: "hover";
    })
  | (BrowserRequestBase & {
      kind: "type";
      text: string;
      submit?: boolean;
      slowly?: boolean;
    })
  | (BrowserRequestBase & {
      kind: "drag";
      startSelector?: string;
      startRef?: string;
      endSelector?: string;
      endRef?: string;
    })
  | (BrowserRequestBase & {
      kind: "select";
      values: string[];
    })
  | (BrowserRequestBase & {
      kind: "fill";
      fields: BrowserFormField[];
    })
  | (BrowserRequestBase & {
      kind: "wait";
      timeMs?: number;
      text?: string;
      textGone?: string;
      url?: string;
      loadState?: "load" | "domcontentloaded" | "networkidle";
    })
  | (BrowserRequestBase & {
      kind: "evaluate";
      fn: string;
    })
  | (BrowserRequestBase & {
      kind: "batch";
      actions: BrowserBatchActionRequest[];
      stopOnError?: boolean;
    })
  | (BrowserRequestBase & {
      kind: "close";
    });

export type BrowserActionRequest =
  | (BrowserRequestBase & {
      kind: "open";
      url: string;
    })
  | BrowserBatchActionRequest
  | (BrowserRequestBase & {
      kind: "set_input_files";
      paths: string[];
    })
  | (BrowserRequestBase & {
      kind: "handle_dialog";
      accept: boolean;
      promptText?: string;
    })
  | (BrowserRequestBase & {
      kind: "console_messages";
      minLevel?: BrowserConsoleLevel;
      clear?: boolean;
      limit?: number;
    })
  | (BrowserRequestBase & {
      kind: "page_errors";
      clear?: boolean;
      limit?: number;
    })
  | (BrowserRequestBase & {
      kind: "network_requests";
      filter?: string;
      clear?: boolean;
      limit?: number;
    })
  | (BrowserRequestBase & {
      kind: "extract_text";
    })
  | (BrowserRequestBase & {
      kind: "screenshot";
      fullPage?: boolean;
      labels?: boolean;
      type?: BrowserImageType;
    });

export type BrowserActionResult = {
  ok: true;
  kind: BrowserActionRequest["kind"];
  targetId: BrowserTargetId;
  profile?: BrowserProfileId;
  url?: string;
  selector?: string;
  ref?: string;
  frame?: string;
  result?: unknown;
};

export type BrowserSnapshotResult =
  | {
      ok: true;
      format: "aria";
      targetId: BrowserTargetId;
      profile?: BrowserProfileId;
      url?: string;
      selector?: string;
      frame?: string;
      labels?: boolean;
      labelsCount?: number;
      labelsSkipped?: number;
      imagePath?: string;
      imageType?: BrowserImageType;
      nodes: BrowserSnapshotAriaNode[];
    }
  | {
      ok: true;
      format: "ai" | "role";
      targetId: BrowserTargetId;
      profile?: BrowserProfileId;
      url?: string;
      selector?: string;
      frame?: string;
      snapshot: string;
      html?: string;
      truncated?: boolean;
      refs?: Record<string, BrowserRoleRef>;
      stats?: BrowserSnapshotStats;
      labels?: boolean;
      labelsCount?: number;
      labelsSkipped?: number;
      imagePath?: string;
      imageType?: BrowserImageType;
    };

export type BrowserScreenshotResult = {
  ok: true;
  targetId: BrowserTargetId;
  profile?: BrowserProfileId;
  url?: string;
  selector?: string;
  frame?: string;
  labels?: boolean;
  labelsCount?: number;
  labelsSkipped?: number;
  fullPage?: boolean;
  filePath: string;
  imageType: BrowserImageType;
};

export type BrowserTab = {
  targetId: BrowserTargetId;
  title: string;
  url: string;
};

export type BrowserTabsResult = {
  ok: true;
  profile?: BrowserProfileId;
  tabs: BrowserTab[];
};
