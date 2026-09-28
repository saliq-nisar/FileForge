export type BusinessDocKind = "invoice" | "quote" | "receipt" | "purchase-order";
export type DocStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";
export type InvoiceTemplateId = "professional" | "minimal" | "modern" | "corporate" | "elegant" | "simple" | "tax";

export interface Party {
  name: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  taxId: string;
  registration: string;
}

export interface TaxDefinition {
  id: string;
  /** Free label so any region works: GST, VAT, Sales Tax, CGST… */
  name: string;
  /** Percentage, e.g. 18 for 18%. */
  rate: number;
  /** Applied on top of the other taxes (e.g. some provincial taxes). */
  compound: boolean;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountType: "percent" | "amount";
  discount: number;
  taxIds: string[];
}

export interface DocumentDesign {
  accent: string;
  font: "sans" | "serif";
  fontSize: number;
  margin: number;
  pageSize: "a4" | "letter";
  showLogo: boolean;
}

export interface BusinessDocument {
  id: string;
  kind: BusinessDocKind;
  number: string;
  status: DocStatus;
  issueDate: string;
  dueDate: string;
  currency: string;
  from: Party;
  to: Party;
  shipTo: string;
  items: LineItem[];
  taxes: TaxDefinition[];
  pricesIncludeTax: boolean;
  discountType: "percent" | "amount";
  discount: number;
  shipping: number;
  additionalCharges: Array<{ id: string; label: string; amount: number }>;
  amountPaid: number;
  poNumber: string;
  reference: string;
  paymentTerms: string;
  paymentMethod: string;
  paymentInstructions: string;
  notes: string;
  terms: string;
  footer: string;
  logo: string | null;
  template: InvoiceTemplateId;
  design: DocumentDesign;
  createdAt: number;
  updatedAt: number;
}

export interface KindConfig {
  label: string;
  plural: string;
  numberLabel: string;
  prefix: string;
  dueLabel: string | null;
  fromLabel: string;
  toLabel: string;
  showPaid: boolean;
  statuses: DocStatus[];
}

export const KIND_CONFIG: Record<BusinessDocKind, KindConfig> = {
  invoice: { label: "Invoice", plural: "Invoices", numberLabel: "Invoice number", prefix: "INV-", dueLabel: "Due date", fromLabel: "From", toLabel: "Bill to", showPaid: true, statuses: ["draft", "sent", "paid", "partial", "overdue", "cancelled"] },
  quote: { label: "Quote", plural: "Quotes", numberLabel: "Quote number", prefix: "QUO-", dueLabel: "Valid until", fromLabel: "From", toLabel: "Prepared for", showPaid: false, statuses: ["draft", "sent", "cancelled"] },
  receipt: { label: "Receipt", plural: "Receipts", numberLabel: "Receipt number", prefix: "RCT-", dueLabel: null, fromLabel: "Received by", toLabel: "Received from", showPaid: true, statuses: ["paid", "cancelled"] },
  "purchase-order": { label: "Purchase Order", plural: "Purchase Orders", numberLabel: "PO number", prefix: "PO-", dueLabel: "Delivery date", fromLabel: "Buyer", toLabel: "Vendor", showPaid: false, statuses: ["draft", "sent", "cancelled"] },
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  partial: "Partially paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const TAX_PRESETS = ["GST", "VAT", "Sales Tax", "HST", "CGST", "SGST", "IGST", "Service Tax"];

export const TEMPLATES: Array<{ id: InvoiceTemplateId; name: string; description: string }> = [
  { id: "professional", name: "Professional", description: "Balanced, clear and widely accepted" },
  { id: "minimal", name: "Minimal", description: "Lots of white space, no color blocks" },
  { id: "modern", name: "Modern", description: "Bold colored header band" },
  { id: "corporate", name: "Corporate", description: "Structured with strong table styling" },
  { id: "elegant", name: "Elegant", description: "Serif typography, refined details" },
  { id: "simple", name: "Simple", description: "Plain and compact" },
  { id: "tax", name: "Tax invoice", description: "Tax IDs and tax breakdown up front" },
];

export const emptyParty = (): Party => ({ name: "", address: "", email: "", phone: "", website: "", taxId: "", registration: "" });

export function isoDate(d = new Date()): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function defaultCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const map: Record<string, string> = { US: "USD", GB: "GBP", IN: "INR", CA: "CAD", AU: "AUD", JP: "JPY", CN: "CNY", CH: "CHF", SG: "SGD", AE: "AED", ZA: "ZAR", BR: "BRL", MX: "MXN", NZ: "NZD", PK: "PKR", NG: "NGN", KE: "KES" };
    const euro = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "GR", "SK", "SI", "LT", "LV", "EE", "LU", "MT", "CY", "HR"];
    if (region && euro.includes(region)) return "EUR";
    return (region && map[region]) || "USD";
  } catch {
    return "USD";
  }
}

export function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unit: "", unitPrice: 0, discountType: "percent", discount: 0, taxIds: [] };
}

export function newBusinessDocument(kind: BusinessDocKind, number: string, from: Party | null): BusinessDocument {
  const today = isoDate();
  return {
    id: crypto.randomUUID(),
    kind,
    number,
    status: kind === "receipt" ? "paid" : "draft",
    issueDate: today,
    dueDate: kind === "receipt" ? "" : addDays(today, kind === "quote" ? 30 : 14),
    currency: defaultCurrency(),
    from: from ?? emptyParty(),
    to: emptyParty(),
    shipTo: "",
    items: [newLineItem()],
    taxes: [],
    pricesIncludeTax: false,
    discountType: "percent",
    discount: 0,
    shipping: 0,
    additionalCharges: [],
    amountPaid: 0,
    poNumber: "",
    reference: "",
    paymentTerms: kind === "invoice" ? "Net 14" : "",
    paymentMethod: kind === "receipt" ? "Bank transfer" : "",
    paymentInstructions: "",
    notes: "",
    terms: "",
    footer: "",
    logo: null,
    template: "professional",
    design: { accent: "#1f2937", font: "sans", fontSize: 10, margin: 48, pageSize: "a4", showLogo: true },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
