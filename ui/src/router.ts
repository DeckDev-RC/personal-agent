import { useEffect, useState, useCallback } from "react";

export type RouteView =
  | "today"
  | "chat"
  | "notifications"
  | "browser"
  | "workspace"
  | "documents"
  | "knowledge"
  | "agents"
  | "contexts"
  | "tasks"
  | "skills"
  | "workflows"
  | "mcp"
  | "analytics"
  | "logs"
  | "settings"
  | "communication";

const VALID_VIEWS = new Set<RouteView>([
  "today", "chat", "notifications", "workspace", "documents", "knowledge", "agents", "contexts", "tasks", "skills", "workflows", "mcp", "analytics", "logs", "settings",
  "browser", "communication",
]);

function parseHash(): { view: RouteView; param?: string } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [segment, ...rest] = hash.split("/");
  const view = VALID_VIEWS.has(segment as RouteView) ? (segment as RouteView) : "today";
  const param = rest.length > 0 ? rest.join("/") : undefined;
  return { view, param };
}

export function setRoute(view: RouteView, param?: string) {
  const hash = param ? `#/${view}/${param}` : `#/${view}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

export function useHashRouter() {
  const [route, setRouteState] = useState(parseHash);

  useEffect(() => {
    const handler = () => setRouteState(parseHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = useCallback((view: RouteView, param?: string) => {
    setRoute(view, param);
  }, []);

  return { view: route.view, param: route.param, navigate };
}
