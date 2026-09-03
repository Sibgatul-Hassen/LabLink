import { overlaps } from "./availability.service";

/**
 * Proposal section 11.1 defines the rule as:
 *
 *   const overlaps = (a, b) => a.from < b.to && b.from < a.to;
 *
 * The comparison is strict "so that back-to-back classes at 11:30 do not block
 * one another". These six cases pin that down; the two back-to-back ones are
 * the reason the helper exists at all.
 */
function win(from: string, to: string) {
  return { from: new Date(from), to: new Date(to) };
}

describe("overlaps", () => {
  it("treats partially overlapping windows as overlapping", () => {
    const a = win("2026-09-01T08:30:00Z", "2026-09-01T11:30:00Z");
    const b = win("2026-09-01T10:00:00Z", "2026-09-01T13:00:00Z");

    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it("treats identical windows as overlapping", () => {
    const a = win("2026-09-01T08:30:00Z", "2026-09-01T11:30:00Z");
    const b = win("2026-09-01T08:30:00Z", "2026-09-01T11:30:00Z");

    expect(overlaps(a, b)).toBe(true);
  });

  it("treats a fully contained window as overlapping", () => {
    const outer = win("2026-09-01T08:00:00Z", "2026-09-01T17:00:00Z");
    const inner = win("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z");

    expect(overlaps(outer, inner)).toBe(true);
    expect(overlaps(inner, outer)).toBe(true);
  });

  it("does not treat back-to-back windows as overlapping", () => {
    // One class ends at 11:30, the next starts at 11:30. These must not block
    // each other, or the same units could never be reused on the same morning.
    const morning = win("2026-09-01T08:30:00Z", "2026-09-01T11:30:00Z");
    const afternoon = win("2026-09-01T11:30:00Z", "2026-09-01T14:30:00Z");

    expect(overlaps(morning, afternoon)).toBe(false);
  });

  it("does not treat back-to-back windows as overlapping in either order", () => {
    const morning = win("2026-09-01T08:30:00Z", "2026-09-01T11:30:00Z");
    const afternoon = win("2026-09-01T11:30:00Z", "2026-09-01T14:30:00Z");

    expect(overlaps(afternoon, morning)).toBe(false);
  });

  it("does not treat windows separated by a gap as overlapping", () => {
    const a = win("2026-09-01T08:30:00Z", "2026-09-01T11:30:00Z");
    const b = win("2026-09-01T14:00:00Z", "2026-09-01T17:00:00Z");

    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });
});
