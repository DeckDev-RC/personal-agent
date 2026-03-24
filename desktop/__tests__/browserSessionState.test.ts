import {
  appendBrowserConsoleEntry,
  appendBrowserPageErrorEntry,
  appendBrowserRequestEntry,
  clearBrowserRoleRefs,
  clearBrowserTargetActivity,
  createBrowserSessionState,
  getBrowserTargetActivity,
  getStoredBrowserRoleRefs,
  readBrowserConsoleEntries,
  readBrowserPageErrorEntries,
  readBrowserRequestEntries,
  resolveBrowserSessionTargetId,
  setBrowserSessionActiveTarget,
  snapshotBrowserTargetActivity,
  storeBrowserRoleRefs,
  upsertBrowserRequestEntry,
} from "../services/browserSessionState.js";

describe("browserSessionState", () => {
  it("tracks the active target independently from stored refs", () => {
    const state = createBrowserSessionState();

    expect(resolveBrowserSessionTargetId(state)).toBe("main");

    setBrowserSessionActiveTarget(state, "billing");
    expect(resolveBrowserSessionTargetId(state)).toBe("billing");

    storeBrowserRoleRefs({
      state,
      targetId: "billing",
      refs: {
        e1: {
          role: "button",
          name: "Save",
        },
      },
      mode: "role",
      url: "https://example.com/billing",
    });

    expect(getStoredBrowserRoleRefs(state, "billing")).toMatchObject({
      mode: "role",
      url: "https://example.com/billing",
      refs: {
        e1: {
          role: "button",
          name: "Save",
        },
      },
    });
  });

  it("clears refs only for the requested target", () => {
    const state = createBrowserSessionState();

    storeBrowserRoleRefs({
      state,
      targetId: "main",
      refs: {
        e1: {
          role: "link",
          name: "Home",
        },
      },
      mode: "role",
    });
    storeBrowserRoleRefs({
      state,
      targetId: "reports",
      refs: {
        e2: {
          role: "button",
          name: "Export",
        },
      },
      mode: "role",
    });

    clearBrowserRoleRefs(state, "main");

    expect(getStoredBrowserRoleRefs(state, "main")).toBeUndefined();
    expect(getStoredBrowserRoleRefs(state, "reports")).toMatchObject({
      refs: {
        e2: {
          role: "button",
          name: "Export",
        },
      },
    });
  });

  it("tracks browser activity independently per target", () => {
    const state = createBrowserSessionState();

    appendBrowserConsoleEntry({
      state,
      targetId: "main",
      entry: {
        level: "info",
        text: "Loaded dashboard",
        timestamp: 1,
      },
    });
    appendBrowserPageErrorEntry({
      state,
      targetId: "billing",
      entry: {
        message: "ReferenceError: total is not defined",
        timestamp: 2,
      },
    });
    appendBrowserRequestEntry({
      state,
      targetId: "billing",
      entry: {
        url: "https://erp.local/api/billing",
        method: "GET",
        status: 200,
        ok: true,
        timestamp: 3,
      },
    });

    expect(getBrowserTargetActivity(state, "main")).toEqual({
      console: [
        {
          level: "info",
          text: "Loaded dashboard",
          timestamp: 1,
        },
      ],
      errors: [],
      requests: [],
    });
    expect(getBrowserTargetActivity(state, "billing")).toEqual({
      console: [],
      errors: [
        {
          message: "ReferenceError: total is not defined",
          timestamp: 2,
        },
      ],
      requests: [
        {
          url: "https://erp.local/api/billing",
          method: "GET",
          status: 200,
          ok: true,
          timestamp: 3,
        },
      ],
    });
  });

  it("caps stored activity and resolves omitted target ids to the active target", () => {
    const state = createBrowserSessionState();
    setBrowserSessionActiveTarget(state, "reports");

    appendBrowserConsoleEntry({
      state,
      entry: {
        level: "log",
        text: "first",
        timestamp: 1,
      },
      maxEntries: 2,
    });
    appendBrowserConsoleEntry({
      state,
      entry: {
        level: "log",
        text: "second",
        timestamp: 2,
      },
      maxEntries: 2,
    });
    appendBrowserConsoleEntry({
      state,
      entry: {
        level: "log",
        text: "third",
        timestamp: 3,
      },
      maxEntries: 2,
    });

    expect(getBrowserTargetActivity(state, "reports")?.console).toEqual([
      {
        level: "log",
        text: "second",
        timestamp: 2,
      },
      {
        level: "log",
        text: "third",
        timestamp: 3,
      },
    ]);

    clearBrowserTargetActivity(state, "reports");
    expect(getBrowserTargetActivity(state, "reports")).toBeUndefined();
  });

  it("upserts requests by id and snapshots activity defensively", () => {
    const state = createBrowserSessionState();

    upsertBrowserRequestEntry({
      state,
      targetId: "main",
      requestId: "r1",
      entry: {
        url: "https://erp.local/api/orders",
        method: "GET",
        resourceType: "xhr",
        timestamp: 1,
      },
    });
    upsertBrowserRequestEntry({
      state,
      targetId: "main",
      requestId: "r1",
      entry: {
        url: "https://erp.local/api/orders",
        method: "GET",
        resourceType: "xhr",
        status: 200,
        ok: true,
        timestamp: 2,
      },
    });

    const snapshot = snapshotBrowserTargetActivity(state, "main");
    expect(snapshot).toEqual({
      console: [],
      errors: [],
      requests: [
        {
          id: "r1",
          url: "https://erp.local/api/orders",
          method: "GET",
          resourceType: "xhr",
          status: 200,
          ok: true,
          timestamp: 2,
        },
      ],
    });

    snapshot?.requests[0] && (snapshot.requests[0].status = 500);
    expect(getBrowserTargetActivity(state, "main")?.requests[0]?.status).toBe(200);
  });

  it("reads console entries with severity filtering and optional clear", () => {
    const state = createBrowserSessionState();

    appendBrowserConsoleEntry({
      state,
      targetId: "main",
      entry: {
        level: "debug",
        text: "trace",
        timestamp: 1,
      },
    });
    appendBrowserConsoleEntry({
      state,
      targetId: "main",
      entry: {
        level: "warning",
        text: "slow response",
        timestamp: 2,
        location: {
          url: "https://erp.local/app.js",
          lineNumber: 10,
        },
      },
    });
    appendBrowserConsoleEntry({
      state,
      targetId: "main",
      entry: {
        level: "error",
        text: "request failed",
        timestamp: 3,
      },
    });

    const filtered = readBrowserConsoleEntries({
      state,
      targetId: "main",
      minLevel: "warning",
    });

    expect(filtered).toEqual([
      {
        level: "warning",
        text: "slow response",
        timestamp: 2,
        location: {
          url: "https://erp.local/app.js",
          lineNumber: 10,
        },
      },
      {
        level: "error",
        text: "request failed",
        timestamp: 3,
      },
    ]);
    filtered[0] && filtered[0].location && (filtered[0].location.lineNumber = 99);
    expect(getBrowserTargetActivity(state, "main")?.console[1]?.location?.lineNumber).toBe(10);

    const cleared = readBrowserConsoleEntries({
      state,
      targetId: "main",
      minLevel: "warning",
      clear: true,
    });

    expect(cleared).toHaveLength(2);
    expect(getBrowserTargetActivity(state, "main")?.console).toEqual([]);
  });

  it("reads page errors and requests with filtering plus clear controls", () => {
    const state = createBrowserSessionState();

    appendBrowserPageErrorEntry({
      state,
      targetId: "billing",
      entry: {
        message: "ReferenceError: total is not defined",
        timestamp: 1,
      },
    });
    appendBrowserRequestEntry({
      state,
      targetId: "billing",
      entry: {
        url: "https://erp.local/api/billing",
        method: "GET",
        status: 200,
        ok: true,
        timestamp: 2,
      },
    });
    appendBrowserRequestEntry({
      state,
      targetId: "billing",
      entry: {
        url: "https://erp.local/assets/app.js",
        method: "GET",
        status: 200,
        ok: true,
        timestamp: 3,
      },
    });

    const errors = readBrowserPageErrorEntries({
      state,
      targetId: "billing",
      clear: true,
    });
    const requests = readBrowserRequestEntries({
      state,
      targetId: "billing",
      filter: "/api/",
      clear: true,
    });

    expect(errors).toEqual([
      {
        message: "ReferenceError: total is not defined",
        timestamp: 1,
      },
    ]);
    expect(requests).toEqual([
      {
        url: "https://erp.local/api/billing",
        method: "GET",
        status: 200,
        ok: true,
        timestamp: 2,
      },
    ]);
    expect(getBrowserTargetActivity(state, "billing")).toEqual({
      console: [],
      errors: [],
      requests: [],
    });
  });
});
