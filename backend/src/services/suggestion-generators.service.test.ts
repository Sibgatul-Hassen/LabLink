import { prisma } from "../lib/prisma";
import { SuggestionGenerators } from "./suggestion-generators.service";

jest.mock("../lib/prisma", () => ({
  prisma: {
    componentSubstitute: { findMany: jest.fn() },
    stockMovement: { groupBy: jest.fn() },
    stock: { findMany: jest.fn() },
    departmentQuota: { findMany: jest.fn() },
    requisitionLine: { findMany: jest.fn() },
    requisition: { findMany: jest.fn() },
    routineSlot: { findMany: jest.fn() },
    suggestion: { findMany: jest.fn(), create: jest.fn() },
  },
}));

function mock(method: unknown): jest.Mock { return method as jest.Mock; }

const now = new Date("2026-09-26T12:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
  mock(prisma.componentSubstitute.findMany).mockResolvedValue([]);
  mock(prisma.stockMovement.groupBy).mockResolvedValue([]);
  mock(prisma.stock.findMany).mockResolvedValue([]);
  mock(prisma.departmentQuota.findMany).mockResolvedValue([]);
  mock(prisma.requisitionLine.findMany).mockResolvedValue([]);
  mock(prisma.requisition.findMany).mockResolvedValue([]);
  mock(prisma.routineSlot.findMany).mockResolvedValue([]);
  mock(prisma.suggestion.findMany).mockResolvedValue([]);
  mock(prisma.suggestion.create).mockResolvedValue({ id: "new" });
});

function createdTypes(): string[] {
  return mock(prisma.suggestion.create).mock.calls.map((call: unknown[]) => {
    const argument = call[0] as { data: { type: string } };
    return argument.data.type;
  });
}

it("suggests viable substitutes and higher reorder points, but skips an already pending suggestion", async () => {
  mock(prisma.componentSubstitute.findMany).mockResolvedValue([{
    originalId: "original", substituteId: "alternative", ratio: 2,
    original: { code: "O", stock: { onHand: 1, reorderPoint: 5 } },
    substitute: { code: "A", stock: { onHand: 8 } },
  }]);
  mock(prisma.stockMovement.groupBy).mockResolvedValue([
    { componentId: "original", _sum: { qty: -28 } },
  ]);
  mock(prisma.stock.findMany).mockResolvedValue([{
    componentId: "original", onHand: 1, reorderPoint: 5,
    component: { code: "O", name: "Original" },
  }]);
  mock(prisma.suggestion.findMany).mockImplementation(async ({ where }: { where: { type: string } }) =>
    where.type === "SUBSTITUTE" ? [{ payload: { key: "original:alternative" } }] : [],
  );

  const counts = await SuggestionGenerators.generateAll(now);
  expect(counts).toEqual({ REORDER_POINT: 1 });
  expect(createdTypes()).toEqual(["REORDER_POINT"]);
  expect(mock(prisma.suggestion.create)).toHaveBeenCalledWith({
    data: expect.objectContaining({
      type: "REORDER_POINT",
      payload: expect.objectContaining({ suggestedReorderPoint: 9 }),
      evidence: expect.objectContaining({ issuedLast28Days: 28 }),
    }),
  });
});

it("routes quota and overdue collection evidence to the responsible roles", async () => {
  mock(prisma.departmentQuota.findMany).mockResolvedValue([{
    departmentId: "cse", componentId: "resistor", qty: 10, suggestedQty: 20,
    department: { code: "CSE" }, component: { code: "R220", name: "Resistor" },
  }]);
  mock(prisma.requisition.findMany).mockResolvedValue([{
    id: "request-1", neededTo: new Date("2026-09-24T10:00:00.000Z"),
    department: { code: "CSE" }, requestedBy: { fullName: "Student" },
    lines: [{ qtyIssued: 3 }],
  }]);

  expect(await SuggestionGenerators.generateAll(now)).toEqual({ QUOTA: 1, COLLECTION_RISK: 1 });
  const calls = mock(prisma.suggestion.create).mock.calls.map((call: unknown[]) =>
    (call[0] as { data: { type: string; targetRole: string; evidence: Record<string, unknown> } }).data,
  );
  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "QUOTA", targetRole: "CENTRAL_STORE_OFFICER" }),
    expect.objectContaining({
      type: "COLLECTION_RISK", targetRole: "CENTRAL_STORE_OFFICER",
      evidence: expect.objectContaining({ originalUnitsIssued: 3 }),
    }),
  ]));
});

it("suggests a viable substitute and a repeated missing experiment item", async () => {
  mock(prisma.componentSubstitute.findMany).mockResolvedValue([{
    originalId: "original", substituteId: "alternative", ratio: 2,
    original: { code: "O", stock: { onHand: 1, reorderPoint: 5 } },
    substitute: { code: "A", stock: { onHand: 8 } },
  }]);
  const classSession = {
    experiment: { id: "experiment-1", items: [] },
    routineSlot: {
      section: { studentCount: 8, course: { departmentId: "cse" } },
      lab: { groupSize: 4 },
    },
  };
  mock(prisma.requisitionLine.findMany).mockResolvedValue([1, 2].map(() => ({
    componentId: "alternative", qtyNeeded: 4,
    component: { code: "A", name: "Alternative", isActive: true },
    requisition: { classSession },
  })));

  expect(await SuggestionGenerators.generateAll(now)).toEqual({ SUBSTITUTE: 1, ITEM_LIST: 1 });
  expect(createdTypes()).toEqual(["SUBSTITUTE", "ITEM_LIST"]);
  expect(mock(prisma.suggestion.create)).toHaveBeenCalledWith({
    data: expect.objectContaining({
      type: "ITEM_LIST", targetRole: "INSTRUCTOR",
      payload: expect.objectContaining({ suggestedQtyPerGroup: 2 }),
      evidence: expect.objectContaining({ sampledOrders: 2 }),
    }),
  });
});

it("proposes a free lab time when effective routine slots overlap", async () => {
  const base = {
    labId: "lab", dayOfWeek: 1,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-12-01T00:00:00.000Z"),
    lab: { name: "Robotics", departmentId: "cse" },
    section: { name: "A", course: { code: "CSE101" } },
  };
  mock(prisma.routineSlot.findMany).mockResolvedValue([
    { ...base, id: "one", startTime: "09:00", endTime: "10:00" },
    { ...base, id: "two", startTime: "09:30", endTime: "10:30" },
  ]);

  expect(await SuggestionGenerators.generateAll(now)).toEqual({ SLOT: 1 });
  expect(mock(prisma.suggestion.create)).toHaveBeenCalledWith({
    data: expect.objectContaining({
      type: "SLOT",
      payload: expect.objectContaining({ proposedStartTime: "08:00", proposedEndTime: "09:00" }),
    }),
  });
});
