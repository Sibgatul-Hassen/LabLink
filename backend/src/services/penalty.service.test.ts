import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { calculatePenaltyAmount, PenaltyService } from "./penalty.service";

jest.mock("../lib/prisma", () => ({
  prisma: {
    penaltyRate: { findMany: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
    penalty: { aggregate: jest.fn() },
    $transaction: jest.fn((callback: (client: unknown) => Promise<unknown>) =>
      callback({ penaltyRate: {
        updateMany: (prisma.penaltyRate.updateMany as unknown as jest.Mock),
        upsert: (prisma.penaltyRate.upsert as unknown as jest.Mock),
      } })),
  },
}));

describe("penalty amount calculation", () => {
  it("charges late days at the configured daily rate and respects a cap", () => {
    expect(calculatePenaltyAmount("LATE", 4, null, 25, null, 80)).toBe(80);
  });

  it("uses the component cost fraction and rounds to two decimals", () => {
    expect(calculatePenaltyAmount("DAMAGED", 3, 12.35, null, 0.25, null)).toBe(9.26);
  });

  it("rejects missing cost or rate rather than charging zero", () => {
    expect(() => calculatePenaltyAmount("LOST", 1, null, null, 1, null)).toThrow(
      "Penalty rate or component cost is missing",
    );
    expect(() => calculatePenaltyAmount("LATE", 0, null, 10, null, null)).toThrow(
      "Invalid penalty quantity",
    );
  });
});

describe("personal requisition penalty gate", () => {
  const rates = prisma.penaltyRate.findMany as unknown as jest.Mock;
  const totals = prisma.penalty.aggregate as unknown as jest.Mock;

  beforeEach(() => jest.clearAllMocks());

  it("blocks when the total outstanding balance reaches the configured threshold", async () => {
    rates.mockResolvedValue([{ type: "LATE", blockThreshold: new Prisma.Decimal(50) }]);
    totals.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(50) } });
    await expect(PenaltyService.assertPersonalAllowed("student-1")).rejects.toThrow(
      "Outstanding penalties have reached the personal requisition limit",
    );
    expect(totals).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "student-1", status: "OUTSTANDING" },
    }));
  });

  it("allows requests below the threshold and when no threshold is configured", async () => {
    rates.mockResolvedValueOnce([{ type: "LOST", blockThreshold: new Prisma.Decimal(100) }]);
    totals.mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(99.99) } });
    await expect(PenaltyService.assertPersonalAllowed("student-1")).resolves.toBeUndefined();

    rates.mockResolvedValueOnce([]);
    totals.mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(500) } });
    await expect(PenaltyService.blockStatus("student-1")).resolves.toEqual({
      blocked: false, outstandingTotal: "500.00", threshold: null,
    });
  });

  it("uses one total balance even when charges come from several penalty types", async () => {
    rates.mockResolvedValue([
      { type: "LATE", blockThreshold: new Prisma.Decimal(50) },
      { type: "DAMAGED", blockThreshold: new Prisma.Decimal(50) },
    ]);
    totals.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(60) } });
    await expect(PenaltyService.blockStatus("student-1")).resolves.toEqual({
      blocked: true, outstandingTotal: "60.00", threshold: "50.00",
    });
  });

  it("synchronizes the threshold across configured rates when a rate is saved", async () => {
    const update = prisma.penaltyRate.updateMany as unknown as jest.Mock;
    const upsert = prisma.penaltyRate.upsert as unknown as jest.Mock;
    update.mockResolvedValue({ count: 2 });
    upsert.mockResolvedValue({ type: "LATE", blockThreshold: new Prisma.Decimal(50) });
    await PenaltyService.setRate({ type: "LATE", ratePerDay: 10, blockThreshold: 50 });
    expect(update).toHaveBeenCalledWith({ data: { blockThreshold: 50 } });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: "LATE" }, update: expect.objectContaining({ blockThreshold: 50 }),
    }));
  });
});
