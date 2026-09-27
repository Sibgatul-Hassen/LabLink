import { prisma } from "../lib/prisma";
import { SuggestionService } from "./suggestion.service";

jest.mock("../lib/prisma", () => ({
  prisma: {
    stock: { findMany: jest.fn() },
    suggestion: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
  },
}));

const stockFindMany = prisma.stock.findMany as unknown as jest.Mock;
const suggestionFindMany = prisma.suggestion.findMany as unknown as jest.Mock;
const suggestionCount = prisma.suggestion.count as unknown as jest.Mock;
const suggestionCreate = prisma.suggestion.create as unknown as jest.Mock;

describe("shortage suggestion generation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates one suggestion for a low component and skips healthy stock", async () => {
    stockFindMany.mockResolvedValue([
      { componentId: "low", onHand: 2, reorderPoint: 5, component: { code: "LOW", name: "Low" } },
      { componentId: "healthy", onHand: 7, reorderPoint: 5, component: { code: "OK", name: "Healthy" } },
    ]);
    suggestionFindMany.mockResolvedValue([]);
    suggestionCreate.mockResolvedValue({ id: "suggestion" });

    expect(await SuggestionService.generateShortageSuggestions()).toBe(1);
    expect(suggestionCreate).toHaveBeenCalledTimes(1);
    expect(suggestionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "SHORTAGE_ALERT",
        targetRole: "CENTRAL_STORE_OFFICER",
        payload: expect.objectContaining({ componentId: "low" }),
        evidence: { onHand: 2, reorderPoint: 5 },
      }),
    });
  });

  it("does not repeat a pending or recently reviewed suggestion", async () => {
    stockFindMany.mockResolvedValue([
      { componentId: "low", onHand: 1, reorderPoint: 5, component: { code: "LOW", name: "Low" } },
    ]);
    suggestionFindMany.mockResolvedValue([{ payload: { componentId: "low" } }]);

    expect(await SuggestionService.generateShortageSuggestions()).toBe(0);
    expect(suggestionCreate).not.toHaveBeenCalled();
  });
});

describe("student slot suggestion scope", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries only slots explicitly tagged for the authenticated student", async () => {
    suggestionFindMany.mockResolvedValue([]);
    suggestionCount.mockResolvedValue(0);
    const result = await SuggestionService.list({ id: "student-a", role: "STUDENT", departmentId: "cse" });
    expect(result.total).toBe(0);
    expect(suggestionFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      type: "SLOT", payload: { path: ["studentId"], equals: "student-a" },
    }) }));
  });
});
