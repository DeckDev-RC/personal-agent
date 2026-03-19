import React from "react";
import "./i18n";
import Shell from "./components/layout/Shell";

declare global {
  interface Window {
    codexAgent: any;
  }
}

export default function App() {
  return <Shell />;
}
