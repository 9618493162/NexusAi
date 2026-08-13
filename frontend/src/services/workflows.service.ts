import { api, refreshAccessToken } from "./api";
import { useAuthStore } from "@/store/auth.store";

export interface WorkflowNode {
  id: string;
  type: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  fromPort: string;
  to: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  userId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { runs: number };
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  nodeStates: Record<string, { status: string; startedAt?: string; endedAt?: string; error?: string }> | null;
  result: string | null;
  outputs: Record<string, any> | null;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export const workflowsService = {
  list: () => api.get<{ workflows: Workflow[] }>("/workflows"),
  get: (id: string) => api.get<{ workflow: Workflow }>(`/workflows/${id}`),
  create: (data: { name: string; description?: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }) =>
    api.post<{ workflow: Workflow }>("/workflows", data),
  update: (id: string, data: Partial<{ name: string; description: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }>) =>
    api.patch<{ workflow: Workflow }>(`/workflows/${id}`, data),
  remove: (id: string) => api.delete(`/workflows/${id}`),
  listRuns: (id: string) => api.get<{ runs: WorkflowRun[] }>(`/workflows/${id}/runs`),

  /** SSE execution stream — same token-refresh-once pattern as the others. */
  run: async (id: string) => {
    const doFetch = (token: string | null) =>
      fetch(`${api.defaults.baseURL}/workflows/${id}/run`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

  /** Authenticated URL for a run's generated TTS audio. */
  audioUrl: (runId: string, nodeId: string) =>
    `${api.defaults.baseURL}/workflows/runs/${runId}/audio/${nodeId}?token=${encodeURIComponent(useAuthStore.getState().accessToken || "")}`,
};
