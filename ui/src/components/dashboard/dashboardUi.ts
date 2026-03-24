export type FirstRunDashboardSnapshot = {
  tasksCount: number;
  sessionsCount: number;
  filesCount: number;
  manualAgendaCount: number;
  connectedMcpCount: number;
};

export function isFirstRunDashboard(snapshot: FirstRunDashboardSnapshot): boolean {
  return (
    snapshot.tasksCount === 0 &&
    snapshot.sessionsCount === 0 &&
    snapshot.filesCount === 0 &&
    snapshot.manualAgendaCount === 0 &&
    snapshot.connectedMcpCount === 0
  );
}
