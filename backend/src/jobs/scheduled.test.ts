import { prisma } from "../lib/prisma";
import { NotificationService } from "../services/notification.service";
import { RequisitionService } from "../services/requisition.service";
import { SessionService } from "../services/session.service";
import { checkLowStock, draftOvernightRequisitions } from "./scheduled";

jest.mock("../lib/prisma", () => ({
  prisma: {
    classSession: { findMany: jest.fn() },
    stock: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    notification: { findFirst: jest.fn() },
  },
}));
jest.mock("../services/notification.service", () => ({
  NotificationService: { createNotification: jest.fn() },
}));
jest.mock("../services/requisition.service", () => ({
  RequisitionService: { draftRequisitionForSession: jest.fn() },
}));
jest.mock("../services/session.service", () => ({
  SessionService: { generateSessions: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

test("drafts tomorrow's class once and notifies its lab assistant", async () => {
  jest.mocked(SessionService.generateSessions).mockResolvedValue({
    created: 0, horizonDays: 21, from: "2026-09-26", to: "2026-10-16",
  });
  jest.mocked(prisma.classSession.findMany).mockResolvedValue([{
    id: "session-1",
    routineSlot: {
      lab: { labAssistantId: "assistant-1" },
      section: {
        labAssistantId: null,
        course: { departmentId: "department-1" },
      },
    },
  }] as never);
  jest.mocked(prisma.user.findFirst).mockResolvedValue({
    id: "assistant-1", role: "LAB_ASSISTANT", departmentId: "department-1",
  } as never);
  jest.mocked(RequisitionService.draftRequisitionForSession).mockResolvedValue({
    id: "requisition-1",
  } as never);

  const result = await draftOvernightRequisitions(new Date("2026-09-26T12:00:00Z"));

  expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });
  expect(prisma.classSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ requisition: null }),
  }));
  expect(RequisitionService.draftRequisitionForSession).toHaveBeenCalledWith(
    "session-1",
    { id: "assistant-1", role: "LAB_ASSISTANT", departmentId: "department-1" },
  );
  expect(NotificationService.createNotification).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "assistant-1", refType: "AUTO_DRAFT" }),
  );
});

test("sends one low-stock alert per recipient per day", async () => {
  jest.mocked(prisma.stock.findMany).mockResolvedValue([{
    componentId: "component-1", onHand: 2, reorderPoint: 5,
    component: { isActive: true, code: "ARD-UNO", name: "Arduino Uno" },
  }] as never);
  jest.mocked(prisma.user.findMany).mockResolvedValue([{ id: "store-1" }] as never);
  jest.mocked(prisma.notification.findFirst)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: "notification-1" } as never);

  const first = await checkLowStock(new Date("2026-09-26T12:00:00Z"));
  const second = await checkLowStock(new Date("2026-09-26T13:00:00Z"));

  expect(first.created).toBe(1);
  expect(second.skipped).toBe(1);
  expect(NotificationService.createNotification).toHaveBeenCalledTimes(1);
  expect(NotificationService.createNotification).toHaveBeenCalledWith(
    expect.objectContaining({ refType: "LOW_STOCK", refId: "component-1" }),
  );
});
