import { Prisma, Role, SuggestionStatus, SuggestionType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { SuggestionGenerators } from "./suggestion-generators.service";

const REVIEW_ROLES: Role[] = [
  "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER",
];

type SuggestionActor = { id: string; role: Role; departmentId: string | null };

function departmentFromPayload(value: Prisma.JsonValue): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return typeof value.departmentId === "string" ? value.departmentId : null;
}

export class SuggestionService {
  private static async teachesExperiment(actorId: string, payload: Prisma.JsonValue): Promise<boolean> {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload) ||
        typeof payload.experimentId !== "string") return false;
    const section = await prisma.section.findFirst({
      where: { instructorId: actorId, course: { experiments: { some: { id: payload.experimentId } } } },
      select: { id: true },
    });
    return !!section;
  }

  static async generateAllSuggestions(): Promise<Record<string, number>> {
    const shortage = await this.generateShortageSuggestions();
    const rest = await SuggestionGenerators.generateAll();
    return { SHORTAGE_ALERT: shortage, ...rest };
  }

  static async generateShortageSuggestions(): Promise<number> {
    const stocks = await prisma.stock.findMany({
      where: { component: { isActive: true }, reorderPoint: { gt: 0 } },
      include: { component: { select: { code: true, name: true } } },
    });
    const recent = await prisma.suggestion.findMany({
      where: {
        type: "SHORTAGE_ALERT",
        OR: [
          { status: "PENDING" },
          { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
      select: { payload: true },
    });
    const trackedIds = new Set(recent.map((item) => {
      const payload = item.payload;
      return typeof payload === "object" && payload !== null && !Array.isArray(payload)
        && typeof payload.componentId === "string" ? payload.componentId : "";
    }));
    let created = 0;
    for (const stock of stocks) {
      if (stock.onHand >= stock.reorderPoint || trackedIds.has(stock.componentId)) continue;
      await prisma.suggestion.create({
        data: {
          type: "SHORTAGE_ALERT",
          targetRole: "CENTRAL_STORE_OFFICER",
          payload: {
            componentId: stock.componentId,
            componentCode: stock.component.code,
            componentName: stock.component.name,
          },
          evidence: { onHand: stock.onHand, reorderPoint: stock.reorderPoint },
        },
      });
      trackedIds.add(stock.componentId);
      created += 1;
    }
    return created;
  }

  static async list(
    actor: SuggestionActor, status?: SuggestionStatus,
    type?: SuggestionType, page = 1, limit = 20,
  ) {
    if (!REVIEW_ROLES.includes(actor.role) && actor.role !== "STUDENT") throw new Error("Forbidden");
    if ((actor.role === "STUDENT" && type && type !== "SLOT") ||
        (actor.role === "INSTRUCTOR" && type && type !== "ITEM_LIST")) {
      return { data: [], total: 0, page, limit };
    }
    const teachingExperimentIds = actor.role === "INSTRUCTOR"
      ? (await prisma.experiment.findMany({
          where: { course: { sections: { some: { instructorId: actor.id } } } },
          select: { id: true },
        })).map((experiment) => experiment.id)
      : [];
    const where: Prisma.SuggestionWhereInput = {
      ...(actor.role === "STUDENT" ? { type: "SLOT" } : { targetRole: actor.role }),
      ...(["LAB_ASSISTANT", "DEPT_STORE_HEAD"].includes(actor.role)
        ? { payload: { path: ["departmentId"], equals: actor.departmentId ?? "__none__" } }
        : {}),
      ...(actor.role === "STUDENT" ? { payload: { path: ["studentId"], equals: actor.id } } : {}),
      ...(actor.role === "INSTRUCTOR" ? { OR: teachingExperimentIds.map((id) => ({ payload: { path: ["experimentId"], equals: id } })) } : {}),
      ...(status ? { status } : {}),
      ...(actor.role === "STUDENT" ? { type: "SLOT" } : actor.role === "INSTRUCTOR" ? { type: "ITEM_LIST" } : type ? { type } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.suggestion.findMany({
        where, include: { feedback: true },
        orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      }),
      prisma.suggestion.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  static async decide(id: string, actor: SuggestionActor, accepted: boolean, note?: string) {
    if (!REVIEW_ROLES.includes(actor.role)) throw new Error("Forbidden");
    await prisma.$transaction(async (tx) => {
      const suggestion = await tx.suggestion.findUnique({ where: { id } });
      if (!suggestion) throw new Error("Suggestion not found");
      if (suggestion.targetRole !== actor.role ||
        (["LAB_ASSISTANT", "DEPT_STORE_HEAD"].includes(actor.role) &&
          departmentFromPayload(suggestion.payload) !== actor.departmentId)) {
        throw new Error("Forbidden");
      }
      if (actor.role === "INSTRUCTOR" &&
          !(await this.teachesExperiment(actor.id, suggestion.payload))) throw new Error("Forbidden");
      if (suggestion.status !== "PENDING") throw new Error("Suggestion already reviewed");
      const updated = await tx.suggestion.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: accepted ? "ACCEPTED" : "DISMISSED",
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new Error("Suggestion already reviewed");
      await tx.suggestionFeedback.create({
        data: { suggestionId: id, accepted, note },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return prisma.suggestion.findUniqueOrThrow({
      where: { id }, include: { feedback: true },
    });
  }
}
