import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "../i18n";

vi.mock("../components/layout/Shell", () => ({
  default: () => <div>Shell mounted</div>,
}));

vi.mock("../components/onboarding/OnboardingWizard", () => ({
  default: () => <div>Onboarding mounted</div>,
}));

import App from "../App";

describe("App", () => {
  it("renders onboarding over the shell while first-run is incomplete", async () => {
    (window as any).codexAgent.store.getSettings = vi.fn().mockResolvedValue({
      onboardingCompleted: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Onboarding mounted")).toBeInTheDocument();
    });
    expect(screen.getByText("Shell mounted")).toBeInTheDocument();
  });
});
