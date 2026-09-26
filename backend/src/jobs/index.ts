import { prisma } from "../lib/prisma";
import { checkLowStock, draftOvernightRequisitions } from "./scheduled";
import { SuggestionService } from "../services/suggestion.service";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function expireOldSuggestions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * DAY);
  const result = await prisma.suggestion.updateMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

async function cancelStaleBorrows(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * DAY);
  const result = await prisma.borrowRequest.updateMany({
    where: { status: "REQUESTED", createdAt: { lt: cutoff } },
    data: { status: "CANCELLED" },
  });
  return result.count;
}

function runJob(name: string, job: () => Promise<unknown>): void {
  void job()
    .then((result) => console.log("[Jobs] " + name, result))
    .catch((error: unknown) => console.error("[Jobs] " + name + " failed", error));
}

export function startBackgroundJobs(): void {
  runJob("draftOvernightRequisitions", draftOvernightRequisitions);
  runJob("checkLowStock", checkLowStock);
  runJob("generateSuggestions", () => SuggestionService.generateAllSuggestions());
  runJob("expireOldSuggestions", expireOldSuggestions);
  runJob("cancelStaleBorrows", cancelStaleBorrows);

  setInterval(() => runJob("draftOvernightRequisitions", draftOvernightRequisitions), DAY);
  setInterval(() => runJob("checkLowStock", checkLowStock), 12 * HOUR);
  setInterval(() => runJob("generateSuggestions", () => SuggestionService.generateAllSuggestions()), DAY);
  setInterval(() => runJob("expireOldSuggestions", expireOldSuggestions), DAY);
  setInterval(() => runJob("cancelStaleBorrows", cancelStaleBorrows), HOUR);
}
