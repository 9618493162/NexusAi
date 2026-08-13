import { api, refreshAccessToken } from "./api";
import { useAuthStore } from "@/store/auth.store";

export interface ProjectMember {
  id: string;
  role: "owner" | "editor" | "viewer";
  user: { id: string; name: string | null; email: string | null; avatar: string | null };
}

export interface ProjectInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  project?: { id: string; name: string; icon: string | null; description: string | null };
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
  _count: { files: number; conversations: number; notes: number; tasks: number; members: number };
}

export interface ProjectNote {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assigneeId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; name: string | null; email: string | null } | null;
}

export interface ProjectFileLink {
  id: string;
  file: { id: string; originalName: string; mimeType: string; size: number; extractedText: string | null; createdAt: string };
}

export interface ProjectConversationLink {
  id: string;
  conversation: { id: string; title: string | null; createdAt: string; updatedAt: string };
}

export interface ProjectActivity {
  id: string;
  type: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
  user?: { name: string | null; avatar: string | null } | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  ownerId: string;
  myRole: "owner" | "editor" | "viewer";
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
  invitations: ProjectInvitation[];
  files: ProjectFileLink[];
  conversations: ProjectConversationLink[];
  notes: ProjectNote[];
  tasks: ProjectTask[];
  _count: { files: number; conversations: number; notes: number; tasks: number; members: number };
}

export const projectsService = {
  list: () => api.get<{ projects: ProjectSummary[]; invitations: ProjectInvitation[] }>("/projects"),
  get: (projectId: string) => api.get<{ project: ProjectDetail; activity: ProjectActivity[] }>(`/projects/${projectId}`),
  create: (data: { name: string; description?: string; icon?: string }) => api.post<{ project: ProjectSummary }>("/projects", data),
  update: (projectId: string, data: { name?: string; description?: string; icon?: string }) => api.patch(`/projects/${projectId}`, data),
  remove: (projectId: string) => api.delete(`/projects/${projectId}`),

  invite: (projectId: string, email: string, role: string) => api.post(`/projects/${projectId}/invitations`, { email, role }),
  respondInvitation: (invitationId: string, accept: boolean) => api.post(`/projects/invitations/${invitationId}/respond`, { accept }),
  cancelInvitation: (projectId: string, invitationId: string) => api.delete(`/projects/${projectId}/invitations/${invitationId}`),
  changeRole: (projectId: string, userId: string, role: string) => api.patch(`/projects/${projectId}/members/${userId}`, { role }),
  removeMember: (projectId: string, userId: string) => api.delete(`/projects/${projectId}/members/${userId}`),

  addFile: (projectId: string, fileId: string) => api.post(`/projects/${projectId}/files`, { fileId }),
  removeFile: (projectId: string, fileId: string) => api.delete(`/projects/${projectId}/files/${fileId}`),
  addConversation: (projectId: string, conversationId: string) => api.post(`/projects/${projectId}/conversations`, { conversationId }),
  removeConversation: (projectId: string, conversationId: string) => api.delete(`/projects/${projectId}/conversations/${conversationId}`),

  createNote: (projectId: string, data: { title: string; content: string }) => api.post<{ note: ProjectNote }>(`/projects/${projectId}/notes`, data),
  updateNote: (projectId: string, noteId: string, data: { title?: string; content?: string }) =>
    api.patch<{ note: ProjectNote }>(`/projects/${projectId}/notes/${noteId}`, data),
  deleteNote: (projectId: string, noteId: string) => api.delete(`/projects/${projectId}/notes/${noteId}`),

  createTask: (projectId: string, data: { title: string; status?: string; assigneeId?: string | null }) =>
    api.post<{ task: ProjectTask }>(`/projects/${projectId}/tasks`, data),
  updateTask: (projectId: string, taskId: string, data: { title?: string; status?: string; assigneeId?: string | null }) =>
    api.patch<{ task: ProjectTask }>(`/projects/${projectId}/tasks/${taskId}`, data),
  deleteTask: (projectId: string, taskId: string) => api.delete(`/projects/${projectId}/tasks/${taskId}`),

  /** SSE stream — same token-refresh-once pattern as chatService.streamChat. */
  askProject: async (projectId: string, message: string, model?: string) => {
    const doFetch = (token: string | null) =>
      fetch(`${api.defaults.baseURL}/projects/${projectId}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, model }),
      });

    let response = await doFetch(useAuthStore.getState().accessToken);
    if (response.status === 401) {
      try {
        const freshToken = await refreshAccessToken();
        response = await doFetch(freshToken);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
        throw new Error("Session expired, please log in again");
      }
    }
    return response;
  },
};
