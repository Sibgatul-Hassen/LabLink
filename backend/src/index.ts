import express from "express";
import cors from "cors";
import { env } from "./config/env";
import healthRouter from "./routes/health.routes";
import authRouter from "./routes/auth.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use(healthRouter);
app.use("/api", authRouter);

app.listen(env.PORT, () => {
  console.log(`LabLink API listening on port ${env.PORT}`);
});
