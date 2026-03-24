import {
  buildRoleSnapshotFromAiText,
  buildRoleSnapshotFromAriaText,
  getBrowserRoleSnapshotStats,
  parseBrowserRoleRef,
} from "../services/browserRoleRefs.js";

describe("browserRoleRefs", () => {
  it("adds refs for interactive elements", () => {
    const aria = [
      '- heading "Example" [level=1]',
      "- paragraph: hello",
      '- button "Submit"',
      "  - generic",
      '- link "Learn more"',
    ].join("\n");

    const result = buildRoleSnapshotFromAriaText(aria, { interactive: true });
    expect(result.snapshot).toContain('[ref=e1]');
    expect(result.snapshot).toContain('[ref=e2]');
    expect(result.snapshot).toContain('- button "Submit" [ref=e1]');
    expect(result.snapshot).toContain('- link "Learn more" [ref=e2]');
    expect(Object.keys(result.refs)).toEqual(["e1", "e2"]);
    expect(result.refs.e1).toMatchObject({ role: "button", name: "Submit" });
    expect(result.refs.e2).toMatchObject({ role: "link", name: "Learn more" });
  });

  it("uses nth only when duplicates exist", () => {
    const aria = ['- button "OK"', '- button "OK"', '- button "Cancel"'].join("\n");
    const result = buildRoleSnapshotFromAriaText(aria);
    expect(result.snapshot).toContain("[ref=e1]");
    expect(result.snapshot).toContain("[ref=e2] [nth=1]");
    expect(result.refs.e1?.nth).toBe(0);
    expect(result.refs.e2?.nth).toBe(1);
    expect(result.refs.e3?.nth).toBeUndefined();
  });

  it("computes snapshot stats", () => {
    const aria = ['- button "OK"', '- button "Cancel"'].join("\n");
    const result = buildRoleSnapshotFromAriaText(aria);
    const stats = getBrowserRoleSnapshotStats(result.snapshot, result.refs);
    expect(stats.refs).toBe(2);
    expect(stats.interactive).toBe(2);
    expect(stats.lines).toBeGreaterThan(0);
    expect(stats.chars).toBeGreaterThan(0);
  });

  it("returns a helpful message when no interactive elements exist", () => {
    const aria = ['- heading "Hello"', "- paragraph: world"].join("\n");
    const result = buildRoleSnapshotFromAriaText(aria, { interactive: true });
    expect(result.snapshot).toBe("(no interactive elements)");
    expect(Object.keys(result.refs)).toEqual([]);
  });

  it("parses browser refs", () => {
    expect(parseBrowserRoleRef("e12")).toBe("e12");
    expect(parseBrowserRoleRef("@e12")).toBe("e12");
    expect(parseBrowserRoleRef("ref=e12")).toBe("e12");
    expect(parseBrowserRoleRef("12")).toBeNull();
    expect(parseBrowserRoleRef("")).toBeNull();
  });

  it("preserves existing aria ref ids in ai snapshots", () => {
    const ai = [
      "- navigation [ref=e1]:",
      '  - link "Home" [ref=e5]',
      '  - heading "Title" [ref=e6]',
      '  - button "Save" [ref=e7] [cursor=pointer]:',
      "  - paragraph: hello",
    ].join("\n");

    const result = buildRoleSnapshotFromAiText(ai, { interactive: true });
    expect(result.snapshot).toContain("[ref=e5]");
    expect(result.snapshot).toContain('- link "Home"');
    expect(result.snapshot).toContain('- button "Save"');
    expect(result.snapshot).not.toContain("navigation");
    expect(result.snapshot).not.toContain("heading");
    expect(Object.keys(result.refs).toSorted()).toEqual(["e5", "e7"]);
    expect(result.refs.e5).toMatchObject({ role: "link", name: "Home" });
    expect(result.refs.e7).toMatchObject({ role: "button", name: "Save" });
  });
});
