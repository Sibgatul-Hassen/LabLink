import { Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { AuthenticatedRequest } from "../types";

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = AuthService.verifyToken(token);
    // Resolve current account state on every request so deactivation, role
    // changes, and department transfers take effect without waiting 8 hours.
    const user = await AuthService.getUserById(payload.sub);
    req.user = {
      id: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
