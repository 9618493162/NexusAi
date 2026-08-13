import { Router } from "express";
import * as meetingController from "../controllers/meeting.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authMiddleware, meetingController.listMeetings);
router.post("/", authMiddleware, meetingController.createMeetingValidators, meetingController.createMeeting);
router.get("/:id", authMiddleware, meetingController.getMeeting);
router.patch("/:id", authMiddleware, meetingController.updateMeetingValidators, meetingController.updateMeeting);
router.delete("/:id", authMiddleware, meetingController.deleteMeeting);
router.post("/:id/summarize", authMiddleware, meetingController.summarizeMeeting);

export default router;
