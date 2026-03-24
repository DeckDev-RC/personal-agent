import React, { useEffect } from "react";
import "./i18n";
import Shell from "./components/layout/Shell";
import OnboardingWizard from "./components/onboarding/OnboardingWizard";
import { useSettingsStore } from "./stores/settingsStore";

declare global {
  interface Window {
    codexAgent: any;
  }
}

export default function App() {
  const { settings, loaded, loadSettings } = useSettingsStore();

  useEffect(() => {
    if (!loaded) {
      void loadSettings();
    }
  }, [loaded, loadSettings]);

  if (!loaded) return null;

  return (
    <>
      <Shell />
      {!settings.onboardingCompleted ? <OnboardingWizard /> : null}
    </>
  );
}
