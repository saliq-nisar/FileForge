import { DEFAULT_THEME, plain, type Block, type DocumentModel } from "@/services/documents/model";

/**
 * Declarative business document templates: a field schema (content) plus a
 * build function (layout). Adding a template = adding an entry here.
 */
export type TemplateField =
  | { key: string; label: string; type: "text" | "textarea" | "date"; placeholder?: string; optional?: boolean; default?: string }
  | { key: string; label: string; type: "pairs"; help?: string; default?: Array<[string, string]> };

export type TemplateValues = Record<string, string | Array<[string, string]>>;

export interface TemplateDefinition {
  slug: string;
  name: string;
  description: string;
  fields: TemplateField[];
  build: (v: TemplateValues) => DocumentModel;
}

const s = (v: TemplateValues, k: string) => (typeof v[k] === "string" ? (v[k] as string) : "").trim();
const pairs = (v: TemplateValues, k: string) => (Array.isArray(v[k]) ? (v[k] as Array<[string, string]>) : []).filter(([a, b]) => a.trim() || b.trim());
const paras = (text: string): Block[] => text.split(/\n{2,}/).filter((p) => p.trim()).map((p) => ({ type: "paragraph", runs: plain(p.trim()), spaceAfter: 8 }));
const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");
const today = () => new Date().toISOString().slice(0, 10);

function letterhead(v: TemplateValues): Block[] {
  return [
    { type: "paragraph", runs: plain(s(v, "company") || "Company name", { bold: true }), size: 14, spaceAfter: 2 },
    ...(s(v, "companyAddress") ? [{ type: "paragraph", runs: plain(s(v, "companyAddress"), { color: "#6b7280" }), size: 9, spaceAfter: 2 } as Block] : []),
    { type: "divider" },
  ];
}

function signature(v: TemplateValues, nameKey = "signatory", titleKey = "signatoryTitle"): Block[] {
  return [
    { type: "spacer", size: 28 },
    { type: "paragraph", runs: plain(s(v, nameKey) || "Name", { bold: true }), spaceAfter: 0 },
    ...(s(v, titleKey) ? [{ type: "paragraph", runs: plain(s(v, titleKey)), spaceAfter: 0 } as Block] : []),
    ...(s(v, "company") ? [{ type: "paragraph", runs: plain(s(v, "company")), spaceAfter: 0 } as Block] : []),
  ];
}

const model = (title: string, blocks: Block[], author?: string): DocumentModel => ({
  title,
  author,
  pageSize: "a4",
  theme: { ...DEFAULT_THEME, size: 10.5, margin: 64, lineHeight: 1.45 },
  blocks,
});

const companyFields: TemplateField[] = [
  { key: "company", label: "Company name", type: "text" },
  { key: "companyAddress", label: "Company address", type: "textarea", optional: true },
];

export const LETTER_TEMPLATES: TemplateDefinition[] = [
  {
    slug: "business-letter",
    name: "Business Letter",
    description: "A formal letter with letterhead, recipient, subject and signature.",
    fields: [
      ...companyFields,
      { key: "date", label: "Date", type: "date", default: today() },
      { key: "recipient", label: "Recipient (name & address)", type: "textarea" },
      { key: "subject", label: "Subject", type: "text", optional: true },
      { key: "salutation", label: "Salutation", type: "text", default: "Dear Sir or Madam," },
      { key: "body", label: "Letter body", type: "textarea", placeholder: "Separate paragraphs with a blank line." },
      { key: "closing", label: "Closing", type: "text", default: "Sincerely," },
      { key: "signatory", label: "Your name", type: "text" },
      { key: "signatoryTitle", label: "Your title", type: "text", optional: true },
    ],
    build: (v) =>
      model("Business letter", [
        ...letterhead(v),
        { type: "spacer", size: 8 },
        { type: "paragraph", runs: plain(fmtDate(s(v, "date"))) },
        { type: "paragraph", runs: plain(s(v, "recipient")), spaceAfter: 14 },
        ...(s(v, "subject") ? [{ type: "paragraph", runs: plain(`Subject: ${s(v, "subject")}`, { bold: true }), spaceAfter: 12 } as Block] : []),
        { type: "paragraph", runs: plain(s(v, "salutation")), spaceAfter: 10 },
        ...paras(s(v, "body")),
        { type: "paragraph", runs: plain(s(v, "closing")) },
        ...signature(v),
      ], s(v, "signatory")),
  },
  {
    slug: "offer-letter",
    name: "Offer Letter",
    description: "Employment offer with role, compensation, start date and terms.",
    fields: [
      ...companyFields,
      { key: "date", label: "Date", type: "date", default: today() },
      { key: "candidate", label: "Candidate name", type: "text" },
      { key: "candidateAddress", label: "Candidate address", type: "textarea", optional: true },
      { key: "position", label: "Position", type: "text" },
      { key: "department", label: "Department", type: "text", optional: true },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "compensation", label: "Compensation", type: "text", placeholder: "e.g. USD 85,000 per year" },
      { key: "location", label: "Work location", type: "text", optional: true },
      { key: "terms", label: "Additional terms", type: "textarea", optional: true, placeholder: "Benefits, probation period, reporting line…" },
      { key: "acceptBy", label: "Please accept by", type: "date", optional: true },
      { key: "signatory", label: "Signed by", type: "text" },
      { key: "signatoryTitle", label: "Signatory title", type: "text", optional: true },
    ],
    build: (v) =>
      model("Offer letter", [
        ...letterhead(v),
        { type: "spacer", size: 8 },
        { type: "paragraph", runs: plain(fmtDate(s(v, "date"))) },
        { type: "paragraph", runs: plain([s(v, "candidate"), s(v, "candidateAddress")].filter(Boolean).join("\n")), spaceAfter: 14 },
        { type: "paragraph", runs: plain(`Subject: Offer of employment — ${s(v, "position")}`, { bold: true }), spaceAfter: 12 },
        { type: "paragraph", runs: plain(`Dear ${s(v, "candidate") || "Candidate"},`), spaceAfter: 10 },
        { type: "paragraph", runs: plain(`We are pleased to offer you the position of ${s(v, "position") || "[position]"}${s(v, "department") ? ` in the ${s(v, "department")} department` : ""} at ${s(v, "company") || "[company]"}. The key terms of this offer are:`) },
        {
          type: "table",
          columns: [{ header: "Term", width: 1 }, { header: "Details", width: 2 }],
          rows: [
            ["Position", s(v, "position")],
            ...(s(v, "department") ? [["Department", s(v, "department")]] : []),
            ["Start date", fmtDate(s(v, "startDate"))],
            ["Compensation", s(v, "compensation")],
            ...(s(v, "location") ? [["Location", s(v, "location")]] : []),
          ],
          headerBg: "#f3f4f6",
        },
        ...paras(s(v, "terms")),
        ...(s(v, "acceptBy") ? [{ type: "paragraph", runs: plain(`Please confirm your acceptance by ${fmtDate(s(v, "acceptBy"))}.`) } as Block] : []),
        { type: "paragraph", runs: plain("We look forward to welcoming you to the team.") },
        { type: "paragraph", runs: plain("Sincerely,") },
        ...signature(v),
        { type: "spacer", size: 30 },
        { type: "paragraph", runs: plain("Accepted by: ______________________________    Date: ______________", { color: "#374151" }) },
      ], s(v, "signatory")),
  },
  {
    slug: "experience-certificate",
    name: "Experience Certificate",
    description: "Certify an employee's tenure and role.",
    fields: [
      ...companyFields,
      { key: "date", label: "Date of issue", type: "date", default: today() },
      { key: "employee", label: "Employee name", type: "text" },
      { key: "employeeId", label: "Employee ID", type: "text", optional: true },
      { key: "position", label: "Last position held", type: "text" },
      { key: "from", label: "Employed from", type: "date" },
      { key: "to", label: "Employed until", type: "date" },
      { key: "remarks", label: "Remarks", type: "textarea", optional: true, placeholder: "Responsibilities and conduct — only statements you can verify." },
      { key: "signatory", label: "Signed by", type: "text" },
      { key: "signatoryTitle", label: "Signatory title", type: "text", optional: true },
    ],
    build: (v) =>
      model("Experience certificate", [
        ...letterhead(v),
        { type: "paragraph", runs: plain(fmtDate(s(v, "date"))), align: "right" },
        { type: "heading", level: 2, text: "TO WHOM IT MAY CONCERN", align: "center" },
        { type: "spacer", size: 6 },
        { type: "paragraph", runs: plain(`This is to certify that ${s(v, "employee") || "[employee]"}${s(v, "employeeId") ? ` (Employee ID: ${s(v, "employeeId")})` : ""} was employed with ${s(v, "company") || "[company]"} from ${fmtDate(s(v, "from")) || "[start]"} to ${fmtDate(s(v, "to")) || "[end]"}. At the time of leaving, their designation was ${s(v, "position") || "[position]"}.`), spaceAfter: 10 },
        ...paras(s(v, "remarks")),
        { type: "paragraph", runs: plain("We wish them every success in their future endeavours.") },
        ...signature(v),
      ], s(v, "signatory")),
  },
  {
    slug: "proposal",
    name: "Business Proposal",
    description: "Overview, scope, timeline and pricing in a clean structure.",
    fields: [
      ...companyFields,
      { key: "title", label: "Proposal title", type: "text", default: "Project proposal" },
      { key: "client", label: "Prepared for", type: "text" },
      { key: "date", label: "Date", type: "date", default: today() },
      { key: "overview", label: "Overview", type: "textarea" },
      { key: "scope", label: "Scope of work (one item per line)", type: "textarea" },
      { key: "timeline", label: "Timeline (one milestone per line)", type: "textarea", optional: true },
      { key: "pricing", label: "Pricing", type: "pairs", help: "Item and price", default: [["", ""]] },
      { key: "terms", label: "Terms", type: "textarea", optional: true },
      { key: "signatory", label: "Prepared by", type: "text" },
    ],
    build: (v) => {
      const lines = (k: string) => s(v, k).split("\n").map((x) => x.trim()).filter(Boolean);
      const price = pairs(v, "pricing");
      return model(s(v, "title") || "Proposal", [
        { type: "banner", title: s(v, "title") || "Proposal", subtitle: `Prepared for ${s(v, "client") || "[client]"} by ${s(v, "company") || "[company]"} · ${fmtDate(s(v, "date"))}`, background: "#1f2937", color: "#ffffff" },
        { type: "heading", level: 2, text: "Overview", rule: true },
        ...paras(s(v, "overview")),
        { type: "heading", level: 2, text: "Scope of work", rule: true },
        { type: "list", items: lines("scope").map((x) => plain(x)) },
        ...(lines("timeline").length ? ([{ type: "heading", level: 2, text: "Timeline", rule: true }, { type: "list", items: lines("timeline").map((x) => plain(x)) }] as Block[]) : []),
        ...(price.length ? ([{ type: "heading", level: 2, text: "Investment", rule: true }, { type: "table", columns: [{ header: "Item", width: 3 }, { header: "Price", width: 1, align: "right" }], rows: price.map(([a, b]) => [a, b]), headerBg: "#f3f4f6" }] as Block[]) : []),
        ...(s(v, "terms") ? ([{ type: "heading", level: 2, text: "Terms", rule: true }, ...paras(s(v, "terms"))] as Block[]) : []),
        ...signature(v, "signatory", "_"),
      ], s(v, "signatory"));
    },
  },
  {
    slug: "salary-slip",
    name: "Salary Slip",
    description: "Payslip with earnings, deductions and net pay.",
    fields: [
      ...companyFields,
      { key: "period", label: "Pay period", type: "text", placeholder: "e.g. September 2026" },
      { key: "employee", label: "Employee name", type: "text" },
      { key: "employeeId", label: "Employee ID", type: "text", optional: true },
      { key: "designation", label: "Designation", type: "text", optional: true },
      { key: "payDate", label: "Pay date", type: "date", default: today() },
      { key: "currency", label: "Currency", type: "text", default: "USD" },
      { key: "earnings", label: "Earnings", type: "pairs", help: "Component and amount", default: [["Basic salary", ""], ["Allowances", ""]] },
      { key: "deductions", label: "Deductions", type: "pairs", help: "Component and amount", default: [["Tax", ""], ["Insurance", ""]] },
    ],
    build: (v) => {
      const cur = s(v, "currency") || "USD";
      const num = (x: string) => Number(x.replace(/[^0-9.-]/g, "")) || 0;
      const fmt = (n: number) => {
        try {
          return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
        } catch {
          return `${n.toFixed(2)} ${cur}`;
        }
      };
      const earn = pairs(v, "earnings");
      const ded = pairs(v, "deductions");
      // Sum in cents to avoid float drift.
      const total = (rows: Array<[string, string]>) => rows.reduce((a, [, b]) => a + Math.round(num(b) * 100), 0) / 100;
      const gross = total(earn);
      const deductions = total(ded);
      return model(`Salary slip ${s(v, "period")}`, [
        ...letterhead(v),
        { type: "heading", level: 2, text: `Salary slip — ${s(v, "period") || "[period]"}`, align: "center" },
        { type: "columns", columns: [
          { width: 1, blocks: [{ type: "keyValue", rows: [["Employee", s(v, "employee")], ["Employee ID", s(v, "employeeId") || "—"], ["Designation", s(v, "designation") || "—"]] }] },
          { width: 1, blocks: [{ type: "keyValue", rows: [["Pay period", s(v, "period")], ["Pay date", fmtDate(s(v, "payDate"))]] }] },
        ] },
        { type: "columns", columns: [
          { width: 1, blocks: [{ type: "table", columns: [{ header: "Earnings", width: 2 }, { header: "Amount", width: 1, align: "right" }], rows: [...earn.map(([a, b]) => [a, fmt(num(b))]), ["Gross earnings", fmt(gross)]], headerBg: "#f3f4f6" }] },
          { width: 1, blocks: [{ type: "table", columns: [{ header: "Deductions", width: 2 }, { header: "Amount", width: 1, align: "right" }], rows: [...ded.map(([a, b]) => [a, fmt(num(b))]), ["Total deductions", fmt(deductions)]], headerBg: "#f3f4f6" }] },
        ] },
        { type: "keyValue", rows: [["Net pay", fmt(gross - deductions)]], width: 0.45, align: "right", emphasizeLast: true },
        { type: "paragraph", runs: plain("This is a computer-generated document.", { color: "#6b7280" }), size: 8, align: "center" },
      ], s(v, "company"));
    },
  },
];

export function getLetterTemplate(slug: string): TemplateDefinition | undefined {
  return LETTER_TEMPLATES.find((t) => t.slug === slug);
}

export function defaultTemplateValues(t: TemplateDefinition): TemplateValues {
  const out: TemplateValues = {};
  for (const f of t.fields) out[f.key] = f.type === "pairs" ? (f.default ?? [["", ""]]) : (f.default ?? "");
  return out;
}
