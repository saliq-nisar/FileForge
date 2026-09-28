import { computeTotals, formatMoney, type Totals } from "@/features/business/calc";
import { KIND_CONFIG, type BusinessDocument, type Party } from "@/features/business/model";
import { DEFAULT_THEME, plain, type Block, type DocumentModel } from "@/services/documents/model";

function partyBlocks(label: string, p: Party, t: { muted: string }, withTax = true): Block[] {
  const lines = [p.address, [p.email, p.phone].filter(Boolean).join(" · "), p.website, withTax && p.taxId ? `Tax ID: ${p.taxId}` : "", p.registration ? `Reg. no: ${p.registration}` : ""].filter(Boolean);
  return [
    { type: "paragraph", runs: plain(label.toUpperCase(), { color: t.muted, bold: true }), size: 8, spaceAfter: 2 },
    { type: "paragraph", runs: plain(p.name || "—", { bold: true }), spaceAfter: 1 },
    ...lines.map((l): Block => ({ type: "paragraph", runs: plain(l), spaceAfter: 0 })),
  ];
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Build the document model for any business document kind and template. */
export function buildBusinessModel(doc: BusinessDocument, totals: Totals = computeTotals(doc)): DocumentModel {
  const cfg = KIND_CONFIG[doc.kind];
  const tpl = doc.template;
  const accent = doc.design.accent;
  const theme = {
    ...DEFAULT_THEME,
    font: tpl === "elegant" ? ("serif" as const) : doc.design.font,
    size: doc.design.fontSize,
    margin: doc.design.margin,
    accent,
    text: "#111827",
    muted: "#6b7280",
  };
  const money = (m: number) => formatMoney(m, doc.currency);
  const title = tpl === "tax" && doc.kind === "invoice" ? "TAX INVOICE" : cfg.label.toUpperCase();

  const meta: Array<[string, string]> = [
    [cfg.numberLabel, doc.number],
    ["Date", fmtDate(doc.issueDate)],
    ...(cfg.dueLabel && doc.dueDate ? [[cfg.dueLabel, fmtDate(doc.dueDate)] as [string, string]] : []),
    ...(doc.poNumber ? [["PO number", doc.poNumber] as [string, string]] : []),
    ...(doc.reference ? [["Reference", doc.reference] as [string, string]] : []),
    ...(doc.paymentTerms && doc.kind === "invoice" ? [["Terms", doc.paymentTerms] as [string, string]] : []),
    ...(doc.kind === "receipt" && doc.paymentMethod ? [["Payment method", doc.paymentMethod] as [string, string]] : []),
  ];

  const blocks: Block[] = [];
  const logo: Block[] = doc.logo && doc.design.showLogo ? [{ type: "image", src: doc.logo, width: 110, height: 44 }] : [];

  // ---- header ----
  if (tpl === "modern") {
    blocks.push({ type: "banner", title, subtitle: `${doc.from.name}${doc.number ? `  ·  ${doc.number}` : ""}`, background: accent, color: "#ffffff" });
    blocks.push({ type: "columns", columns: [{ width: 1, blocks: logo }, { width: 1, blocks: [{ type: "keyValue", rows: meta, size: 9 }] }] });
  } else {
    const titleBlock: Block = { type: "heading", level: 1, text: title, align: tpl === "minimal" || tpl === "simple" ? "left" : "right", color: tpl === "minimal" ? "#111827" : accent, size: tpl === "simple" ? theme.size * 1.6 : undefined };
    blocks.push({
      type: "columns",
      columns: [
        { width: 1.2, blocks: [...logo, ...(tpl === "tax" ? partyBlocks(cfg.fromLabel, doc.from, theme) : [{ type: "paragraph", runs: plain(doc.from.name || "Your business", { bold: true }), size: theme.size * 1.3 } as Block, ...partyBlocks("", doc.from, theme).slice(2)])] },
        { width: 1, blocks: [titleBlock, { type: "keyValue", rows: meta, size: 9 }] },
      ],
    });
  }
  blocks.push({ type: "spacer", size: 10 });
  if (tpl !== "minimal") blocks.push({ type: "divider", color: tpl === "corporate" ? accent : "#e5e7eb", thickness: tpl === "corporate" ? 1.5 : 0.75 });

  // ---- parties ----
  const partyCols: Array<{ width: number; blocks: Block[] }> = [{ width: 1, blocks: partyBlocks(cfg.toLabel, doc.to, theme) }];
  if (doc.shipTo.trim()) partyCols.push({ width: 1, blocks: [{ type: "paragraph", runs: plain("SHIP TO", { color: theme.muted, bold: true }), size: 8, spaceAfter: 2 }, { type: "paragraph", runs: plain(doc.shipTo) }] });
  if (tpl === "modern" || tpl === "tax") partyCols.unshift({ width: 1, blocks: partyBlocks(cfg.fromLabel, doc.from, theme) });
  blocks.push({ type: "columns", columns: partyCols });
  blocks.push({ type: "spacer", size: 12 });

  // ---- items ----
  const hasDiscount = doc.items.some((i) => i.discount > 0);
  const hasTax = doc.taxes.length > 0 && doc.items.some((i) => i.taxIds.length);
  const hasUnit = doc.items.some((i) => i.unit.trim());
  const taxName = (ids: string[]) => ids.map((id) => doc.taxes.find((t) => t.id === id)).filter(Boolean).map((t) => `${t!.name} ${t!.rate}%`).join(", ");
  const columns = [
    { header: "Description", width: 4.2 },
    { header: "Qty", width: 0.9, align: "right" as const },
    ...(hasUnit ? [{ header: "Unit", width: 0.9 }] : []),
    { header: "Price", width: 1.5, align: "right" as const },
    ...(hasDiscount ? [{ header: "Discount", width: 1.2, align: "right" as const }] : []),
    ...(hasTax ? [{ header: "Tax", width: 1.4 }] : []),
    { header: "Amount", width: 1.6, align: "right" as const },
  ];
  const rows = doc.items
    .filter((i) => i.description.trim() || i.unitPrice)
    .map((i) => {
      const line = totals.lines.find((l) => l.id === i.id)!;
      return [
        i.description || "—",
        String(i.quantity),
        ...(hasUnit ? [i.unit] : []),
        money(Math.round(i.unitPrice * totals.factor)),
        ...(hasDiscount ? [i.discount ? (i.discountType === "percent" ? `${i.discount}%` : money(line.discount)) : ""] : []),
        ...(hasTax ? [taxName(i.taxIds)] : []),
        money(line.net),
      ];
    });
  const headerBg = tpl === "minimal" || tpl === "simple" ? undefined : tpl === "corporate" || tpl === "modern" ? accent : "#f3f4f6";
  const headerColor = tpl === "corporate" || tpl === "modern" ? "#ffffff" : undefined;
  blocks.push({ type: "table", columns, rows: rows.length ? rows : [["No items yet", ...columns.slice(1).map(() => "")]], headerBg, headerColor, zebra: tpl === "corporate" });

  // ---- totals ----
  const sums: Array<[string, string]> = [["Subtotal", money(totals.subtotal)]];
  if (totals.documentDiscount) sums.push([`Discount${doc.discountType === "percent" ? ` (${doc.discount}%)` : ""}`, `−${money(totals.documentDiscount)}`]);
  for (const t of totals.taxes) sums.push([`${t.name} (${t.rate}%)${doc.pricesIncludeTax ? " incl." : ""}`, money(t.amount)]);
  if (totals.shipping) sums.push(["Shipping", money(totals.shipping)]);
  for (const c of doc.additionalCharges) if (c.amount) sums.push([c.label || "Additional charge", money(Math.round(c.amount * totals.factor))]);
  if (KIND_CONFIG[doc.kind].showPaid && doc.kind !== "receipt") {
    sums.push(["Total", money(totals.total)]);
    if (totals.paid) sums.push(["Amount paid", `−${money(totals.paid)}`]);
    sums.push(["Balance due", money(totals.balance)]);
  } else if (doc.kind === "receipt") {
    sums.push(["Total paid", money(totals.total)]);
  } else {
    sums.push(["Total", money(totals.total)]);
  }
  blocks.push({ type: "keyValue", rows: sums, width: 0.45, align: "right", emphasizeLast: true });

  // ---- notes ----
  const sections: Array<[string, string]> = [
    ["Payment instructions", doc.paymentInstructions],
    ["Notes", doc.notes],
    ["Terms & conditions", doc.terms],
  ];
  for (const [label, text] of sections) {
    if (!text.trim()) continue;
    blocks.push({ type: "heading", level: 3, text: label, color: tpl === "minimal" ? "#111827" : accent });
    blocks.push({ type: "paragraph", runs: plain(text.trim()), size: theme.size * 0.95, color: "#374151" });
  }

  return {
    title: `${cfg.label} ${doc.number}`.trim(),
    author: doc.from.name || undefined,
    subject: `${cfg.label} for ${doc.to.name}`,
    pageSize: doc.design.pageSize,
    theme,
    blocks,
    footer: doc.footer.trim() || undefined,
  };
}
