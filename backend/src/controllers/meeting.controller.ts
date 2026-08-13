import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import * as meetingService from "../services/meeting.service";
import * as chatService from "../services/chat.service";
import { logger } from "../config/logger";

export const createMeetingValidators = [
  body("title").trim().isLength({ min: 2, max: 120 }).withMessage("Meeting title is required (2–120 chars)"),
  body("sourceLang").optional().isString().isLength({ min: 2, max: 10 }),
  body("targetLang").optional().isString().isLength({ min: 2, max: 10 }),
];

export const updateMeetingValidators = [
  body("title").optional().trim().isLength({ min: 2, max: 120 }),
  body("status").optional().isIn(["live", "ended"]),
  body("sourceLang").optional().isString().isLength({ min: 2, max: 10 }),
  body("targetLang").optional().isString().isLength({ min: 2, max: 10 }),
  body("transcript").optional().isString(),
  body("translation").optional({ nullable: true }).isString(),
  body("summary").optional({ nullable: true }).isString(),
  body("actionItems").optional({ nullable: true }).isString(),
  body("notes").optional({ nullable: true }).isString(),
  body("durationSec").optional().isInt({ min: 0 }),
  body("endedAt").optional({ nullable: true }).isISO8601(),
];

function hasErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return true;
  }
  return false;
}

export async function createMeeting(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const meeting = await meetingService.createMeeting(req.user!.userId, req.body);
    res.status(201).json({ meeting });
  } catch (error: any) {
    logger.error("Create meeting error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function listMeetings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const meetings = await meetingService.listMeetings(req.user!.userId);
    res.json({ meetings });
  } catch (error: any) {
    logger.error("List meetings error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function getMeeting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const meeting = await meetingService.getMeeting(req.user!.userId, String(req.params.id));
    if (!meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.json({ meeting });
  } catch (error: any) {
    logger.error("Get meeting error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function updateMeeting(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (hasErrors(req, res)) return;
  try {
    const meeting = await meetingService.updateMeeting(req.user!.userId, String(req.params.id), req.body);
    if (!meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.json({ meeting });
  } catch (error: any) {
    logger.error("Update meeting error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function deleteMeeting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ok = await meetingService.deleteMeeting(req.user!.userId, String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.json({ message: "Meeting deleted" });
  } catch (error: any) {
    logger.error("Delete meeting error:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * SSE: generate the meeting summary + action items from the meeting's REAL
 * transcript through the existing chat pipeline, then persist both on the
 * meeting record. Ownership is checked before anything is read or written.
 */
export async function summarizeMeeting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const meeting = await meetingService.getMeeting(req.user!.userId, String(req.params.id));
    if (!meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }

    const messages = meetingService.buildSummaryMessages(meeting);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let full = "";
    for await (const chunk of chatService.streamChat(messages, undefined, req.user!.userId)) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    // Persist the real AI output split into summary + action items.
    const summary = full.trim();
    const actionItems = extractActionItems(summary);

    await meetingService.updateMeeting(req.user!.userId, meeting.id, {
      summary: summary || null,
      actionItems: actionItems || null,
      status: "ended",
      endedAt: meeting.endedAt || new Date(),
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    logger.error("Meeting summarize error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Summary failed" })}\n\n`);
    res.end();
  }
}

/**
 * Pull the ACTION ITEMS section out of the AI summary output. Tolerates the
 * formats the model actually produces: bolded (**ACTION ITEMS**), numbered
 * (4. ACTION ITEMS), or a plain header — with `*`, `-`, `•` or numbered items.
 */
function extractActionItems(text: string): string | null {
  const header = /\*{0,2}\s*\d*\.?\s*ACTION ITEMS?\*{0,2}\s*:?\s*\n/;
  const stop = /\n\s*\*{0,2}\s*\d*\.?\s*(?:NOTES|NEXT STEPS|QUESTIONS|DISCUSSION|DECISIONS|MEETING SUMMARY|KEY DISCUSSION POINTS)\s*:?\s*\*{0,2}/;
  const match = text.match(new RegExp(`${header.source}([\\s\\S]*?)(?:${stop.source}|\\s*$)`));
  if (!match) return null;
  const items = match[1]
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").replace(/^\s*\d+\.\s*/, "").trim())
    .filter((l) => l.length > 0 && !/no action items?\b/i.test(l));
  return items.length ? items.join("\n") : null;
}
