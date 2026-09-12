import { Router } from "express";

const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  return res.status(200).json({ status: "ok", service: "lablink-api" });
});

export default healthRouter;
