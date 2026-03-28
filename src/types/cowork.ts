export type CoworkProjectStatus = "active" | "paused" | "completed";

export type CoworkMilestone = {
  id: string;
  projectId: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  taskIds: string[];
};

export type CoworkProject = {
  id: string;
  name: string;
  projectContextId: string;
  status: CoworkProjectStatus;
  milestones: CoworkMilestone[];
  openTaskCount: number;
  overdueTaskCount: number;
  nextDeadline?: string;
  createdAt: number;
  updatedAt: number;
};

export type CoworkMeetingStatus = "upcoming" | "in_progress" | "completed";
export type CoworkMeetingSource = "manual" | "calendar_mcp";

export type CoworkMeeting = {
  id: string;
  title: string;
  scheduledAt: number;
  duration: number;
  participants: string[];
  projectContextId?: string;
  prepSessionId?: string;
  notesSessionId?: string;
  actionItemTaskIds: string[];
  followUpDraftIds: string[];
  status: CoworkMeetingStatus;
  source: CoworkMeetingSource;
  createdAt: number;
  updatedAt: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  location?: string;
  attendees: string[];
  source: string;
};

export type DailyBriefing = {
  date: string;
  greeting: string;
  tasksOverdue: number;
  tasksDueToday: number;
  tasksInProgress: number;
  upcomingMeetings: CoworkMeeting[];
  pendingDrafts: number;
  recentFiles: { title: string; category: string; updatedAt: number }[];
  calendarEvents: CalendarEvent[];
};

export type CoworkSnapshot = {
  tasksOverdue: number;
  tasksDueToday: number;
  tasksInProgress: number;
  pendingDrafts: number;
  upcomingMeetingsCount: number;
  activeProjectsCount: number;
  upcomingMeetings: CoworkMeeting[];
  activeProjects: CoworkProject[];
  recentFiles: { title: string; category: string; updatedAt: number }[];
};

export type CoworkTab = "dashboard" | "meetings" | "projects" | "communications" | "focus";
