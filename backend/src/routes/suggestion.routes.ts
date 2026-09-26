import { Router, Response } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { suggestionDecisionSchema, suggestionQuerySchema } from "../schemas/suggestion.schema";
import { SuggestionService } from "../services/suggestion.service";
import { AuthenticatedRequest } from "../types";

const router = Router();
const reviewRoles = [
  "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN",
] as const;
const generateRoles = ["CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"] as const;

function handleError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request" });
  } else if (error instanceof Error && error.message === "Suggestion not found") {
    res.status(404).json({ error: error.message });
  } else if (error instanceof Error && error.message === "Suggestion already reviewed") {
    res.status(409).json({ error: error.message });
  } else {
    res.status(500).json({ error: "Internal server error" });
  }
}

router.get("/suggestions", requireAuth, requireRole(...reviewRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
      const query = suggestionQuerySchema.parse(req.query);
      res.status(200).json(await SuggestionService.list(
        req.user, query.status, query.type, query.page, query.limit,
      ));
    } catch (error) { handleError(error, res); }
  },
);

router.post("/suggestions/generate", requireAuth, requireRole(...generateRoles),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const created = await SuggestionService.generateAllSuggestions();
      res.status(200).json({ created });
    } catch (error) { handleError(error, res); }
  },
);

router.patch("/suggestions/:id/decision", requireAuth, requireRole(...reviewRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
      const body = suggestionDecisionSchema.parse(req.body);
      const result = await SuggestionService.decide(
        req.params.id, req.user, body.accepted, body.note,
      );
      res.status(200).json({ data: result });
    } catch (error) { handleError(error, res); }
  },
);

export default router;
