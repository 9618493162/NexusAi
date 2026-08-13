import { prisma } from "../config/database";
import * as chatService from "./chat.service";

/**
 * AI Meeting Intelligence service. Every query is ownership-scoped to the
 * authenticated user — a meeting id from the frontend never grants access to
 * another user's record. Meetings are honest single-participant (user + AI)
 * sessions: the transcript is real Deepgram output streamed via the existing
 * voice proxy, translations and summaries go through the existing chat
 * pipeline, and there are no fabricated participants or recordings.
 */

export async function createMeeting(userId: string, data: { title: string; sourceLang?: string; targetLang?: string }) {
  const meeting = await prisma.meeting.create({
    data: {
      userId,
      title: data.title.trim().slice(0, 120) || "Untitled meeting",
      sourceLang: data.sourceLang || "en",
      targetLang: data.targetLang || "en",
      status: "live",
    },
  });
  return meeting;
}

export async function listMeetings(userId: string) {
  return prisma.meeting.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMeeting(userId: string, meetingId: string) {
  return prisma.meeting.findFirst({ where: { id: meetingId, userId } });
}

export async function updateMeeting(
  userId: string,
  meetingId: string,
  data: Partial<{
    title: string;
    status: string;
    sourceLang: string;
    targetLang: string;
    transcript: string;
    translation: string | null;
    summary: string | null;
    actionItems: string | null;
    notes: string | null;
    durationSec: number;
    endedAt: Date | null;
  }>
) {
  const existing = await prisma.meeting.findFirst({ where: { id: meetingId, userId } });
  if (!existing) return null;

  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim().slice(0, 120) || "Untitled meeting";
  if (data.status !== undefined) patch.status = data.status === "live" ? "live" : "ended";
  if (data.sourceLang !== undefined) patch.sourceLang = data.sourceLang;
  if (data.targetLang !== undefined) patch.targetLang = data.targetLang;
  if (data.transcript !== undefined) patch.transcript = data.transcript;
  if (data.translation !== undefined) patch.translation = data.translation || null;
  if (data.summary !== undefined) patch.summary = data.summary || null;
  if (data.actionItems !== undefined) patch.actionItems = data.actionItems || null;
  if (data.notes !== undefined) patch.notes = data.notes || null;
  if (data.durationSec !== undefined) patch.durationSec = Math.max(0, Math.floor(data.durationSec));
  if (data.endedAt !== undefined) patch.endedAt = data.endedAt;

  return prisma.meeting.update({ where: { id: meetingId }, data: patch });
}

export async function deleteMeeting(userId: string, meetingId: string) {
  const existing = await prisma.meeting.findFirst({ where: { id: meetingId, userId } });
  if (!existing) return false;
  await prisma.meeting.delete({ where: { id: meetingId } });
  return true;
}

/** Cap applied to the transcript when generating the summary. */
const SUMMARY_TRANSCRIPT_SLICE = 16000;

/**
 * Generate the meeting summary + action items from the REAL transcript via the
 * existing chat pipeline (save=false — nothing new is persisted by the chat
 * layer; the result is stored on the meeting record by the controller).
 */
export function buildSummaryMessages(meeting: { title: string; transcript: string; sourceLang: string }) {
  const transcript = meeting.transcript.trim().slice(0, SUMMARY_TRANSCRIPT_SLICE) || "(The meeting had no captured speech.)";
  const system =
    "You are NexusAI Meetings, a meeting intelligence assistant. Based ONLY on the transcript provided, produce:\n" +
    "1. MEETING SUMMARY — a concise overview (3-6 sentences).\n" +
    "2. KEY DISCUSSION POINTS — a short bulleted list.\n" +
    "3. DECISIONS — what was decided (or 'No explicit decisions were recorded.').\n" +
    "4. ACTION ITEMS — a bulleted list of concrete next steps, each phrased as an imperative. If none are present in the transcript, write 'No action items were mentioned.'\n" +
    "Never invent details that are not in the transcript. Reply in the language the transcript is mostly written in.";
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `MEETING: ${meeting.title}\n\nTRANSCRIPT:\n${transcript}` },
  ];
}

/** True when the transcript contains real captured speech worth summarizing. */
export function hasRealContent(meeting: { transcript: string }): boolean {
  const t = meeting.transcript.trim();
  return t.length > 0 && t !== "(no speech captured)";
}
