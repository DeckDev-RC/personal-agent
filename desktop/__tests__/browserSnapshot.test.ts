import {
  accessibilitySnapshotToAriaText,
  buildRoleSnapshotFromAccessibilitySnapshot,
  buildRoleSnapshotFromPageAiSnapshot,
  flattenAccessibilitySnapshot,
  type BrowserAccessibilitySnapshotNode,
} from "../services/browserSnapshot.js";

describe("browserSnapshot", () => {
  it("converts accessibility trees into aria-like snapshot text", () => {
    const tree: BrowserAccessibilitySnapshotNode = {
      role: "main",
      name: "Dashboard",
      children: [
        { role: "heading", name: "Orders" },
        { role: "button", name: "New order" },
      ],
    };

    const text = accessibilitySnapshotToAriaText(tree);
    expect(text).toContain('- main "Dashboard"');
    expect(text).toContain('  - heading "Orders"');
    expect(text).toContain('  - button "New order"');
  });

  it("flattens accessibility trees into aria nodes", () => {
    const tree: BrowserAccessibilitySnapshotNode = {
      role: "main",
      children: [
        { role: "heading", name: "Orders" },
        { role: "button", name: "New order" },
      ],
    };

    const nodes = flattenAccessibilitySnapshot(tree);
    expect(nodes).toEqual([
      {
        ref: "e1",
        role: "main",
        name: "",
        value: undefined,
        description: undefined,
        depth: 0,
      },
      {
        ref: "e2",
        role: "heading",
        name: "Orders",
        value: undefined,
        description: undefined,
        depth: 1,
      },
      {
        ref: "e3",
        role: "button",
        name: "New order",
        value: undefined,
        description: undefined,
        depth: 1,
      },
    ]);
  });

  it("builds a role snapshot with stable refs from accessibility trees", () => {
    const tree: BrowserAccessibilitySnapshotNode = {
      role: "main",
      name: "Dashboard",
      children: [
        { role: "heading", name: "Orders" },
        { role: "button", name: "New order" },
        { role: "link", name: "View all" },
      ],
    };

    const result = buildRoleSnapshotFromAccessibilitySnapshot(tree);
    expect(result.snapshot).toContain('[ref=e1]');
    expect(result.snapshot).toContain('[ref=e2]');
    expect(result.refs.e1).toMatchObject({ role: "main", name: "Dashboard" });
    expect(result.refs.e2).toMatchObject({ role: "heading", name: "Orders" });
    expect(result.stats.refs).toBe(4);
  });

  it("builds a role snapshot from Playwright AI snapshots while preserving aria refs", async () => {
    const page = {
      _snapshotForAI: vi.fn(async () => ({
        full: [
          "- navigation [ref=e1]:",
          '  - link "Home" [ref=e5]',
          '  - button "Save" [ref=e7] [cursor=pointer]:',
        ].join("\n"),
      })),
    };

    const result = await buildRoleSnapshotFromPageAiSnapshot(page, {
      timeoutMs: 4_200,
    });

    expect(page._snapshotForAI).toHaveBeenCalledWith({
      timeout: 4200,
      track: "response",
    });
    expect(result.snapshot).toContain('[ref=e5]');
    expect(result.snapshot).toContain('[ref=e7]');
    expect(result.refs.e1).toMatchObject({ role: "navigation" });
    expect(result.refs.e5).toMatchObject({ role: "link", name: "Home" });
    expect(result.refs.e7).toMatchObject({ role: "button", name: "Save" });
    expect(result.stats.refs).toBe(3);
  });

  it("fails clearly when Playwright AI snapshots are unavailable", async () => {
    await expect(
      buildRoleSnapshotFromPageAiSnapshot({}),
    ).rejects.toThrow(/_snapshotForAI/i);
  });
});
