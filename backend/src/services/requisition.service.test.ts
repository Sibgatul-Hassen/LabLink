import { splitReturnCounts } from "./requisition.service";

describe("physical return accounting", () => {
  it("ignores request metadata when all physical units are accounted for", () => {
    const item = {
      componentId: "meter", goodQty: 4, damagedQty: 1, lostQty: 0, usedUpQty: 0,
    };
    expect(splitReturnCounts(item, [5])).toEqual([
      { goodQty: 4, damagedQty: 1, lostQty: 0, usedUpQty: 0 },
    ]);
  });
  it("splits a component shared by a direct line and a substitute allocation", () => {
    expect(splitReturnCounts(
      { goodQty: 3, damagedQty: 1, lostQty: 1, usedUpQty: 0 },
      [2, 3],
    )).toEqual([
      { goodQty: 2, damagedQty: 0, lostQty: 0, usedUpQty: 0 },
      { goodQty: 1, damagedQty: 1, lostQty: 1, usedUpQty: 0 },
    ]);
  });

  it("rejects a return larger than the issued physical quantity", () => {
    expect(() => splitReturnCounts(
      { goodQty: 3, damagedQty: 0, lostQty: 0, usedUpQty: 0 },
      [2],
    )).toThrow("Return quantities exceed issued units");
  });
});
