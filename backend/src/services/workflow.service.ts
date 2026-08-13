import { prisma } from "../config/database";
import { WorkflowNode, WorkflowEdge, executeWorkflow, WorkflowEvent, validateWorkflow } from "./workflow.engine";

export interface WorkflowDraft {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export async function listWorkflows(userId: string) {
  return prisma.workflow.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { runs: true } } },
  });
}

export async function getWorkflow(userId: string, id: string) {
  return prisma.workflow.findFirst({ where: { id, userId } });
}

export async function createWorkflow(userId: string, data: WorkflowDraft) {
  return prisma.workflow.create({
    data: {
      name: data.name.trim() || "Untitled workflow",
      description: data.description?.trim() || null,
      nodes: data.nodes as any,
      edges: data.edges as any,
      userId,
    },
  });
}

export async function updateWorkflow(userId: string, id: string, data: Partial<WorkflowDraft>) {
  const existing = await prisma.workflow.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.workflow.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() || "Untitled workflow" } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      ...(data.nodes !== undefined ? { nodes: data.nodes as any } : {}),
      ...(data.edges !== undefined ? { edges: data.edges as any } : {}),
    },
  });
}

export async function deleteWorkflow(userId: string, id: string) {
  const existing = await prisma.workflow.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.workflow.delete({ where: { id } });
}

export async function listRuns(userId: string, workflowId: string, limit = 20) {
  return prisma.workflowRun.findMany({
    where: { userId, workflowId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRun(userId: string, runId: string) {
  return prisma.workflowRun.findFirst({ where: { id: runId, userId } });
}

export async function saveRun(userId: string, workflowId: string, data: {
  status: string;
  result: string;
  outputs: Record<string, any>;
  nodeStates: Record<string, any>;
  error?: string | null;
  startedAt: Date;
}) {
  return prisma.workflowRun.create({
    data: {
      workflowId,
      userId,
      status: data.status,
      result: data.result,
      outputs: data.outputs as any,
      nodeStates: data.nodeStates as any,
      error: data.error ?? null,
      startedAt: data.startedAt,
      endedAt: new Date(),
    },
  });
}

export { executeWorkflow, validateWorkflow };
export type { WorkflowEvent };
