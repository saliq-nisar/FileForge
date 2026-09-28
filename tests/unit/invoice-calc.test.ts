import { describe, expect, it } from "vitest";
import { computeTotals, effectiveStatus, formatDocNumber, nextAvailableNumber, roundHalfAway } from "@/features/business/calc";
import type { BusinessDocument, LineItem, TaxDefinition } from "@/features/business/model";

function item(p: Partial<LineItem>): LineItem {
  return { id: crypto.randomUUID(), description: "x", quantity: 1, unit: "", unitPrice: 0, discountType: "percent", discount: 0, taxIds: [], ...p };
}

function doc(p: Partial<BusinessDocument> & { items: LineItem[] }) {
  return { taxes: [] as TaxDefinition[], pricesIncludeTax: false, discountType: "percent" as const, discount: 0, shipping: 0, additionalCharges: [], amountPaid: 0, currency: "USD", ...p };
}

describe("invoice totals (minor units)", () => {
  it("sums lines exactly without float drift", () => {
    const t = computeTotals(doc({ items: [item({ quantity: 3, unitPrice: 0.1 }), item({ quantity: 1, unitPrice: 0.2 })] }));
    expect(t.subtotal).toBe(50); // $0.50
    expect(t.total).toBe(50);
  });

  it("applies line discounts (percent and fixed, capped at gross)", () => {
    const t = computeTotals(doc({ items: [item({ quantity: 2, unitPrice: 50, discount: 10 }), item({ unitPrice: 20, discountType: "amount", discount: 999 })] }));
    expect(t.lines[0]).toMatchObject({ gross: 10000, discount: 1000, net: 9000 });
    expect(t.lines[1]).toMatchObject({ gross: 2000, discount: 2000, net: 0 });
  });

  it("computes multiple exclusive taxes per line", () => {
    const gst: TaxDefinition = { id: "g", name: "GST", rate: 5, compound: false };
    const pst: TaxDefinition = { id: "p", name: "PST", rate: 7, compound: false };
    const t = computeTotals(doc({ taxes: [gst, pst], items: [item({ unitPrice: 100, taxIds: ["g", "p"] }), item({ unitPrice: 50, taxIds: ["g"] })] }));
    expect(t.taxes.find((x) => x.id === "g")!.amount).toBe(750);
    expect(t.taxes.find((x) => x.id === "p")!.amount).toBe(700);
    expect(t.total).toBe(15000 + 1450);
  });

  it("applies compound taxes on top of simple taxes", () => {
    const a: TaxDefinition = { id: "a", name: "A", rate: 10, compound: false };
    const b: TaxDefinition = { id: "b", name: "B", rate: 10, compound: true };
    const t = computeTotals(doc({ taxes: [a, b], items: [item({ unitPrice: 100, taxIds: ["a", "b"] })] }));
    expect(t.taxes.find((x) => x.id === "b")!.amount).toBe(1100); // 10% of 110
    expect(t.total).toBe(12100);
  });

  it("extracts tax from tax-inclusive prices", () => {
    const vat: TaxDefinition = { id: "v", name: "VAT", rate: 20, compound: false };
    const t = computeTotals(doc({ taxes: [vat], pricesIncludeTax: true, items: [item({ unitPrice: 120, taxIds: ["v"] })] }));
    expect(t.taxes[0].amount).toBe(2000);
    expect(t.total).toBe(12000);
  });

  it("allocates the document discount before tax and adds shipping/charges after", () => {
    const tax: TaxDefinition = { id: "t", name: "Tax", rate: 10, compound: false };
    const t = computeTotals(doc({ taxes: [tax], discount: 10, items: [item({ unitPrice: 100, taxIds: ["t"] })], shipping: 5, additionalCharges: [{ id: "c", label: "Fee", amount: 2.5 }], amountPaid: 50 }));
    expect(t.documentDiscount).toBe(1000);
    expect(t.taxTotal).toBe(900);
    expect(t.total).toBe(9000 + 900 + 500 + 250);
    expect(t.balance).toBe(t.total - 5000);
  });

  it("respects zero-decimal currencies", () => {
    const t = computeTotals(doc({ currency: "JPY", items: [item({ quantity: 3, unitPrice: 333.4 })] }));
    expect(t.factor).toBe(1);
    expect(t.subtotal).toBe(1000);
  });

  it("rounds half away from zero despite binary noise", () => {
    expect(roundHalfAway(1.005 * 100)).toBe(101);
    expect(roundHalfAway(-2.5)).toBe(-3);
  });

  it("ignores negative or invalid input values", () => {
    const t = computeTotals(doc({ items: [item({ quantity: -5, unitPrice: 10 }), item({ quantity: Number.NaN, unitPrice: 10 })], shipping: -10 }));
    expect(t.total).toBe(0);
  });
});

describe("invoice numbering", () => {
  it("formats numbers with prefix, year and padding", () => {
    expect(formatDocNumber({ prefix: "INV-", includeYear: true, padding: 4, next: 1 }, 2026)).toBe("INV-2026-0001");
    expect(formatDocNumber({ prefix: "Q", includeYear: false, padding: 3, next: 42 }, 2026)).toBe("Q042");
  });

  it("skips numbers already used to prevent duplicates", () => {
    const s = { prefix: "INV-", includeYear: true, padding: 4, next: 1 };
    expect(nextAvailableNumber(s, new Set(["INV-2026-0001", "INV-2026-0002"]), 2026)).toEqual({ number: "INV-2026-0003", next: 3 });
  });
});

describe("invoice status", () => {
  const base = { kind: "invoice", status: "sent", dueDate: "2000-01-01" } as BusinessDocument;
  it("derives overdue, partial and paid", () => {
    const totals = (total: number, paid: number) => ({ total, paid, balance: total - paid }) as ReturnType<typeof computeTotals>;
    expect(effectiveStatus(base, totals(100, 0))).toBe("overdue");
    expect(effectiveStatus({ ...base, dueDate: "2999-01-01" }, totals(100, 40))).toBe("partial");
    expect(effectiveStatus(base, totals(100, 100))).toBe("paid");
    expect(effectiveStatus({ ...base, status: "draft" }, totals(100, 0))).toBe("draft");
  });
});
