import { Router, Response } from "express";
import { loginRequestSchema } from "../schemas/auth.schema";
import { AuthService } from "../services/auth.service";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.post("/auth/login", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validated = loginRequestSchema.parse(req.body);
    const result = await AuthService.login(validated.email, validated.password);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Invalid email or password")) {
        res.status(401).json({ error: "Invalid email or password" });
      } else if (error.message.includes("Invalid") || error.message.includes("required")) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const user = await AuthService.getUserById(req.user.id);
    res.status(200).json({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ error: "User not found" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;
