import React, { useEffect, useState } from "react";
import "./i18n";
import Shell from "./components/layout/Shell";
import OnboardingWizard from "./components/onboarding/OnboardingWizard";

declare global {
  interface Window {
    codexAgent: any;
  }
}

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (window as any).codexAgent?.store?.getSettings?.().then((settings: any) => {
      if (settings && !settings.onboardingCompleted) {
        setShowOnboarding(true);
      }
      setChecked(true);
    }).catch(() => setChecked(true));
  }, []);

  if (!checked) return null;

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
      <Shell />
    </>
  );
}
