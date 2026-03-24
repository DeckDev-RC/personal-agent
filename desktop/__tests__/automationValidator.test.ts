import { validateAutomationDraft } from "../services/automationValidator.js";

describe("automationValidator", () => {
  it("accepts slice D browser actions with the required args", () => {
    const report = validateAutomationDraft({
      recipes: [
        {
          id: "recipe-slice-d",
          name: "Slice D",
          steps: [
            {
              id: "drag",
              action: "browser_drag",
              args: {
                startSelector: ".card-a",
                endSelector: ".card-b",
              },
            },
            {
              id: "select",
              action: "browser_select",
              args: {
                selector: "select[name=status]",
                values: "approved, active",
              },
            },
            {
              id: "fill",
              action: "browser_fill",
              args: {
                fields:
                  '[{"selector":"input[name=email]","value":"user@example.com"}]',
              },
            },
            {
              id: "evaluate",
              action: "browser_evaluate",
              args: {
                fn: "() => document.title",
              },
            },
            {
              id: "batch",
              action: "browser_batch",
              args: {
                actions:
                  '[{"kind":"click","selector":"button.save"},{"kind":"wait","text":"Saved"}]',
              },
            },
            {
              id: "upload",
              action: "browser_set_input_files",
              args: {
                selector: "input[type=file]",
                paths: "C:\\docs\\a.pdf, C:\\docs\\b.pdf",
              },
            },
            {
              id: "dialog",
              action: "browser_handle_dialog",
              args: {
                accept: true,
              },
            },
          ],
        },
      ],
    });

    expect(report.checks.filter((check) => check.severity === "error")).toEqual(
      [],
    );
  });

  it("rejects slice D browser actions when required args are missing", () => {
    const report = validateAutomationDraft({
      recipes: [
        {
          id: "recipe-invalid",
          name: "Slice D invalido",
          steps: [
            { id: "drag", action: "browser_drag", args: {} },
            { id: "select", action: "browser_select", args: {} },
            { id: "fill", action: "browser_fill", args: {} },
            { id: "evaluate", action: "browser_evaluate", args: {} },
            { id: "batch", action: "browser_batch", args: {} },
            { id: "upload", action: "browser_set_input_files", args: {} },
            { id: "dialog", action: "browser_handle_dialog", args: {} },
          ],
        },
      ],
    });

    const messages = report.checks
      .filter((check) => check.severity === "error")
      .map((check) => check.message);

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("browser_drag requires startSelector/startRef and endSelector/endRef"),
        expect.stringContaining("browser_select requires args.selector or args.ref, plus args.values"),
        expect.stringContaining("browser_fill requires args.fields"),
        expect.stringContaining("browser_evaluate requires args.fn"),
        expect.stringContaining("browser_batch requires args.actions"),
        expect.stringContaining("browser_set_input_files requires args.selector or args.ref, plus args.paths"),
        expect.stringContaining("browser_handle_dialog requires args.accept"),
      ]),
    );
  });
});
