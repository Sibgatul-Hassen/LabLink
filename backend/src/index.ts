import express from "express";
import cors from "cors";
import { env } from "./config/env";
import healthRouter from "./routes/health.routes";
import authRouter from "./routes/auth.routes";
import componentRouter from "./routes/component.routes";
import departmentRouter from "./routes/department.routes";
import courseRouter from "./routes/course.routes";
import sectionRouter from "./routes/section.routes";
import labRouter from "./routes/lab.routes";
import routineSlotRouter from "./routes/routine-slot.routes";
import experimentRouter from "./routes/experiment.routes";
import sessionRouter from "./routes/session.routes";
import analyticsRouter from "./routes/analytics.routes";
import stockRouter from "./routes/stock.routes";
import quotaRouter from "./routes/quota.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use(healthRouter);
app.use("/api", authRouter);
app.use("/api", componentRouter);
app.use("/api", departmentRouter);
app.use("/api", courseRouter);
app.use("/api", sectionRouter);
app.use("/api", labRouter);
app.use("/api", routineSlotRouter);
app.use("/api", experimentRouter);
app.use("/api", sessionRouter);
app.use("/api", analyticsRouter);
app.use("/api", stockRouter);
app.use("/api", quotaRouter);

app.listen(env.PORT, () => {
  console.log(`LabLink API listening on port ${env.PORT}`);
});
