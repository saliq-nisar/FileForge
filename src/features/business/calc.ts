import type { BusinessDocument, DocStatus, TaxDefinition } from "./model";

/**
 * Invoice arithmetic in integer minor units (cents) to avoid floating-point
 * drift. Totals are always derived from line items — never trusted from input.
 *
 * Rules:
 * - line gross = quantity × unit price (rounded to minor units)
 * - line discount: % of gross, or a fixed amount capped at gross
 * - document discount: % or fixed, allocated to lines proportionally (largest remainder)
 * - tax-exclusive: each tax = Σ(taxable line base × rate), rounded once per tax;
 *   compound taxes apply to base + non-compound taxes of that line
 * - tax-inclusive: prices contain tax; tax is extracted as base × rate / (1 + Σrates)
 * - shipping and additional charges are added after tax (not taxed)
 */
export interface TaxLine {
  id: string;
  name: string;
  rate: number;
  amount: number;
}

export interface Totals {
  /** Minor units per major unit (100 for USD, 1 for JPY). */
  factor: number;
  lines: Array<{ id: string; gross: number; discount: number; net: number }>;
  subtotal: number;
  lineDiscounts: number;
  documentDiscount: number;
  taxes: TaxLine[];
  taxTotal: number;
  shipping: number;
  charges: number;
  total: number;
  paid: number;
  balance: number;
}

const factorCache = new Map<string, number>();

export function currencyFactor(currency: string): number {
  let f = factorCache.get(currency);
  if (f === undefined) {
    try {
      const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
      f = 10 ** digits;
    } catch {
      f = 100;
    }
    factorCache.set(currency, f);
  }
  return f;
}

/** Round half away from zero, robust to binary float noise (1.005 → 1.01). */
export function roundHalfAway(x: number): number {
  const r = Math.round(Math.abs(x) + 1e-9 * Math.max(1, Math.abs(x)));
  return x < 0 ? -r : r;
}

export function toMinor(amount: number, factor: number): number {
  return Number.isFinite(amount) ? roundHalfAway(amount * factor) : 0;
}

function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map(Math.floor);
  let rest = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floored[i]++;
    rest--;
  }
  return floored;
}

export function computeTotals(doc: Pick<BusinessDocument, "items" | "taxes" | "pricesIncludeTax" | "discountType" | "discount" | "shipping" | "additionalCharges" | "amountPaid" | "currency">): Totals {
  const factor = currencyFactor(doc.currency);
  const lines = doc.items.map((item) => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const gross = roundHalfAway(qty * price * factor);
    const d = Math.max(0, Number(item.discount) || 0);
    const discount = item.discountType === "percent" ? Math.min(gross, roundHalfAway((gross * Math.min(100, d)) / 100)) : Math.min(gross, toMinor(d, factor));
    return { id: item.id, gross, discount, net: gross - discount, taxIds: item.taxIds };
  });
  const subtotal = lines.reduce((a, l) => a + l.net, 0);
  const lineDiscounts = lines.reduce((a, l) => a + l.discount, 0);
  const dv = Math.max(0, Number(doc.discount) || 0);
  const documentDiscount = doc.discountType === "percent" ? Math.min(subtotal, roundHalfAway((subtotal * Math.min(100, dv)) / 100)) : Math.min(subtotal, toMinor(dv, factor));
  const alloc = allocate(documentDiscount, lines.map((l) => l.net));

  const taxById = new Map<string, TaxDefinition>(doc.taxes.map((t) => [t.id, t]));
  const raw = new Map<string, number>();
  lines.forEach((l, i) => {
    const base = l.net - alloc[i];
    const applied = l.taxIds.map((id) => taxById.get(id)).filter((t): t is TaxDefinition => Boolean(t));
    if (!applied.length || base <= 0) return;
    if (doc.pricesIncludeTax) {
      const sumRates = applied.reduce((a, t) => a + t.rate / 100, 0);
      const netBase = base / (1 + sumRates);
      for (const t of applied) raw.set(t.id, (raw.get(t.id) ?? 0) + (netBase * t.rate) / 100);
    } else {
      let simple = 0;
      for (const t of applied.filter((x) => !x.compound)) {
        const amt = (base * t.rate) / 100;
        simple += amt;
        raw.set(t.id, (raw.get(t.id) ?? 0) + amt);
      }
      for (const t of applied.filter((x) => x.compound)) raw.set(t.id, (raw.get(t.id) ?? 0) + ((base + simple) * t.rate) / 100);
    }
  });
  const taxes: TaxLine[] = doc.taxes
    .filter((t) => raw.has(t.id))
    .map((t) => ({ id: t.id, name: t.name || "Tax", rate: t.rate, amount: roundHalfAway(raw.get(t.id)!) }));
  const taxTotal = taxes.reduce((a, t) => a + t.amount, 0);
  const shipping = toMinor(Math.max(0, Number(doc.shipping) || 0), factor);
  const charges = doc.additionalCharges.reduce((a, c) => a + toMinor(Math.max(0, Number(c.amount) || 0), factor), 0);
  const afterDiscount = subtotal - documentDiscount;
  const total = (doc.pricesIncludeTax ? afterDiscount : afterDiscount + taxTotal) + shipping + charges;
  const paid = toMinor(Math.max(0, Number(doc.amountPaid) || 0), factor);
  return {
    factor,
    lines: lines.map(({ id, gross, discount, net }) => ({ id, gross, discount, net })),
    subtotal,
    lineDiscounts,
    documentDiscount,
    taxes,
    taxTotal,
    shipping,
    charges,
    total,
    paid,
    balance: total - paid,
  };
}

export function formatMoney(minor: number, currency: string, locale?: string): string {
  const factor = currencyFactor(currency);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / factor);
  } catch {
    return `${(minor / factor).toFixed(Math.log10(factor))} ${currency}`;
  }
}

/** Effective status: drafts/sent invoices past due with a balance are overdue. */
export function effectiveStatus(doc: BusinessDocument, totals: Totals, today = new Date()): DocStatus {
  if (doc.kind !== "invoice") return doc.status;
  if (doc.status === "cancelled" || doc.status === "draft") return doc.status;
  if (totals.total > 0 && totals.balance <= 0) return "paid";
  if (doc.dueDate && new Date(`${doc.dueDate}T23:59:59`) < today && totals.balance > 0) return "overdue";
  if (totals.paid > 0 && totals.balance > 0) return "partial";
  return doc.status === "paid" || doc.status === "partial" || doc.status === "overdue" ? "sent" : doc.status;
}

// ---------------- numbering ----------------

export interface NumberingSettings {
  prefix: string;
  includeYear: boolean;
  padding: number;
  next: number;
}

export function formatDocNumber(s: NumberingSettings, year = new Date().getFullYear()): string {
  const n = String(Math.max(1, Math.floor(s.next))).padStart(Math.min(10, Math.max(1, s.padding)), "0");
  return `${s.prefix}${s.includeYear ? `${year}-` : ""}${n}`;
}

/** Next free number, skipping numbers already used by saved documents. */
export function nextAvailableNumber(s: NumberingSettings, used: Set<string>, year = new Date().getFullYear()): { number: string; next: number } {
  let next = Math.max(1, s.next);
  let number = formatDocNumber({ ...s, next }, year);
  let guard = 0;
  while (used.has(number) && guard++ < 100_000) {
    next++;
    number = formatDocNumber({ ...s, next }, year);
  }
  return { number, next };
}
