"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Download, FileText, ImagePlus, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { BuilderLayout } from "@/components/documents/builder-layout";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Segmented, Switch, Textarea } from "@/components/ui/form";
import { Badge, Notice } from "@/components/ui/misc";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/utils/cn";
import { toast } from "@/stores/toast-store";
import { buildBusinessModel } from "@/templates/invoices";
import { imageFileToDataUrl } from "@/features/editor/image-utils";
import { computeTotals, formatMoney } from "./calc";
import { KIND_CONFIG, STATUS_LABEL, TAX_PRESETS, TEMPLATES, newBusinessDocument, newLineItem, type BusinessDocKind, type BusinessDocument, type LineItem, type Party } from "./model";
import { advanceNumbering, businessRepository, forgetProfile, loadProfile, saveProfile, suggestNumber, usedNumbers } from "./storage";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CNY", "CHF", "SGD", "AED", "ZAR", "BRL", "MXN", "NZD", "PKR", "NGN", "KES", "SEK", "NOK", "DKK", "PLN", "HKD", "SAR", "ILS", "TRY", "KRW", "IDR", "MYR", "PHP", "THB"];

function PartyForm({ party, onChange, showTax = true }: { party: Party; onChange: (p: Party) => void; showTax?: boolean }) {
  const set = (k: keyof Party) => (e: { target: { value: string } }) => onChange({ ...party, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">{(p) => <Input {...p} value={party.name} onChange={set("name")} autoComplete="organization" />}</Field>
      <Field label="Address" optional className="sm:col-span-2">{(p) => <Textarea {...p} value={party.address} onChange={set("address")} className="min-h-20" />}</Field>
      <Field label="Email" optional>{(p) => <Input {...p} type="email" value={party.email} onChange={set("email")} />}</Field>
      <Field label="Phone" optional>{(p) => <Input {...p} type="tel" value={party.phone} onChange={set("phone")} />}</Field>
      {showTax && (
        <>
          <Field label="Website" optional>{(p) => <Input {...p} value={party.website} onChange={set("website")} />}</Field>
          <Field label="Tax ID (GST / VAT / EIN…)" optional>{(p) => <Input {...p} value={party.taxId} onChange={set("taxId")} />}</Field>
          <Field label="Registration number" optional>{(p) => <Input {...p} value={party.registration} onChange={set("registration")} />}</Field>
        </>
      )}
    </div>
  );
}

function NumberInput({ value, onChange, label, step = "0.01", min = 0, className, ...rest }: { value: number; onChange: (v: number) => void; label: string; step?: string; min?: number; className?: string; id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) {
  return <Input {...rest} aria-label={rest.id ? undefined : label} type="number" inputMode="decimal" min={min} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} className={className} />;
}

function initialState(kind: BusinessDocKind, id: string) {
  const existing = id !== "new" ? businessRepository.get(id) : undefined;
  if (existing) return { doc: existing, saved: true, profileLoaded: false, step: 5 };
  const profile = loadProfile();
  const doc = newBusinessDocument(kind, suggestNumber(kind), profile?.party ?? null);
  if (!profile) return { doc, saved: false, profileLoaded: false, step: 0 };
  doc.logo = profile.logo;
  doc.currency = profile.currency || doc.currency;
  doc.design.accent = profile.accent || doc.design.accent;
  doc.paymentInstructions = profile.paymentInstructions;
  doc.terms = profile.terms;
  // Business details already filled: start at the customer step.
  return { doc, saved: false, profileLoaded: true, step: 1 };
}

export function DocumentBuilder({ kind, id }: { kind: BusinessDocKind; id: string }) {
  const cfg = KIND_CONFIG[kind];
  const router = useRouter();
  // Client-only component (see document-builder-client): browser storage is readable here.
  const [initial] = useState(() => initialState(kind, id));
  const [doc, setDoc] = useState<BusinessDocument>(initial.doc);
  const [saved, setSaved] = useState(initial.saved);
  const [remember, setRemember] = useState(initial.profileLoaded);
  const profileLoaded = initial.profileLoaded;
  const [step, setStep] = useState(initial.step);
  const [busy, setBusy] = useState<string | null>(null);

  const totals = useMemo(() => computeTotals(doc), [doc]);
  const model = useMemo(() => buildBusinessModel(doc, totals), [doc, totals]);

  const update = (patch: Partial<BusinessDocument>) => setDoc((d) => ({ ...d, ...patch }));
  const updateItem = (itemId: string, patch: Partial<LineItem>) => update({ items: doc.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  const money = (m: number) => formatMoney(m, doc.currency);
  const duplicateNumber = usedNumbers(kind, doc.id).has(doc.number);

  const persistProfile = (on: boolean) => {
    if (on) {
      saveProfile({ party: doc.from, logo: doc.logo, currency: doc.currency, accent: doc.design.accent, paymentInstructions: doc.paymentInstructions, terms: doc.terms });
    } else {
      forgetProfile();
    }
  };

  const save = () => {
    if (duplicateNumber) {
      toast.error(`${cfg.numberLabel} ${doc.number} is already used. Choose another number.`);
      setStep(3);
      return false;
    }
    try {
      const isNew = !saved;
      businessRepository.save(doc);
      if (isNew) advanceNumbering(kind);
      if (remember) persistProfile(true);
      setSaved(true);
      toast.success(`${cfg.label} saved on this device.`);
      if (id === "new") router.replace(`/business/${kind}/${doc.id}`);
      return true;
    } catch {
      toast.error("Couldn't save — this browser's storage is full or unavailable.");
      return false;
    }
  };

  const exportAs = async (format: "pdf" | "docx") => {
    setBusy(format);
    try {
      const { downloadDocument } = await import("@/services/documents/export");
      await downloadDocument(model, format, `${cfg.label}-${doc.number || "draft"}`);
      if (remember) persistProfile(true);
    } catch {
      toast.error(`Couldn't create the ${format.toUpperCase()} file.`);
    } finally {
      setBusy(null);
    }
  };

  const steps = ["Your business", cfg.toLabel, "Items", "Settings", "Design", "Ready"];

  const stepContent = [
    // 1. business
    <div key="b" className="flex flex-col gap-5">
      {profileLoaded && <Notice tone="success" title="Your business information">✓ Already filled from your saved details.</Notice>}
      <PartyForm party={doc.from} onChange={(from) => update({ from })} />
      <div className="flex flex-wrap items-center gap-3">
        {doc.logo ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local logo data URL */}
            <img src={doc.logo} alt="Logo" className="h-12 max-w-40 rounded border border-border bg-white object-contain p-1" />
            <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => update({ logo: null })}>
              Remove logo
            </Button>
          </div>
        ) : (
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm hover:bg-bg-subtle focus-within:ring-2 focus-within:ring-accent/30">
            <ImagePlus className="size-4" aria-hidden="true" /> Add logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 2_000_000) return toast.error("Please use a logo under 2 MB.");
                const img = await imageFileToDataUrl(f, 600);
                if (img) update({ logo: img.src });
              }}
            />
          </label>
        )}
      </div>
      <Switch
        label="Remember my business details on this device"
        description="Saved only in this browser so your next document starts pre-filled. Turn off to forget them."
        checked={remember}
        onChange={(v) => {
          setRemember(v);
          persistProfile(v);
          if (!v) toast.info("Saved business details removed from this device.");
        }}
      />
    </div>,
    // 2. customer
    <div key="c" className="flex flex-col gap-5">
      <PartyForm party={doc.to} onChange={(to) => update({ to })} showTax={kind !== "receipt"} />
      {(kind === "invoice" || kind === "purchase-order") && (
        <Field label="Ship to" optional help="Only if different from the billing address.">{(p) => <Textarea {...p} value={doc.shipTo} onChange={(e) => update({ shipTo: e.target.value })} className="min-h-16" />}</Field>
      )}
    </div>,
    // 3. items
    <div key="i" className="flex flex-col gap-3">
      {doc.items.map((item, idx) => {
        const line = totals.lines.find((l) => l.id === item.id);
        return (
          <fieldset key={item.id} className="rounded-lg border border-border bg-surface p-3">
            <legend className="sr-only">Item {idx + 1}</legend>
            <div className="flex items-start gap-2">
              <Field label="Description" className="flex-1">{(p) => <Input {...p} value={item.description} placeholder="Service or product" onChange={(e) => updateItem(item.id, { description: e.target.value })} />}</Field>
              <IconButton label={`Remove item ${idx + 1}`} className="mt-6" disabled={doc.items.length === 1} onClick={() => update({ items: doc.items.filter((i) => i.id !== item.id) })}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Qty">{(p) => <NumberInput {...p} label="Quantity" value={item.quantity} step="any" onChange={(quantity) => updateItem(item.id, { quantity })} />}</Field>
              <Field label="Unit" optional>{(p) => <Input {...p} value={item.unit} placeholder="hrs, pcs" onChange={(e) => updateItem(item.id, { unit: e.target.value })} />}</Field>
              <Field label="Price">{(p) => <NumberInput {...p} label="Unit price" value={item.unitPrice} onChange={(unitPrice) => updateItem(item.id, { unitPrice })} />}</Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Amount</span>
                <span className="flex h-10 items-center justify-end rounded-md bg-bg-subtle px-3 text-sm font-medium tabular-nums">{money(line?.net ?? 0)}</span>
              </div>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted hover:text-fg">Discount & tax</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex gap-2">
                  <NumberInput label="Line discount" value={item.discount} onChange={(discount) => updateItem(item.id, { discount })} className="flex-1" />
                  <Select aria-label="Discount type" value={item.discountType} onChange={(e) => updateItem(item.id, { discountType: e.target.value as "percent" | "amount" })}>
                    <option value="percent">%</option>
                    <option value="amount">{doc.currency}</option>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {doc.taxes.length === 0 && <span className="text-xs text-subtle">Add taxes in Settings to apply them here.</span>}
                  {doc.taxes.map((t) => {
                    const on = item.taxIds.includes(t.id);
                    return (
                      <button key={t.id} type="button" aria-pressed={on} onClick={() => updateItem(item.id, { taxIds: on ? item.taxIds.filter((x) => x !== t.id) : [...item.taxIds, t.id] })} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted")}>
                        {t.name || "Tax"} {t.rate}%
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>
          </fieldset>
        );
      })}
      <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => update({ items: [...doc.items, { ...newLineItem(), taxIds: doc.taxes.map((t) => t.id) }] })}>
        Add item
      </Button>
      <dl className="ml-auto mt-2 w-full max-w-xs text-sm">
        <div className="flex justify-between py-1"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(totals.subtotal)}</dd></div>
        {totals.taxes.map((t) => (
          <div key={t.id} className="flex justify-between py-1"><dt className="text-muted">{t.name} ({t.rate}%)</dt><dd className="tabular-nums">{money(t.amount)}</dd></div>
        ))}
        <div className="flex justify-between border-t border-border py-1.5 font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(totals.total)}</dd></div>
      </dl>
    </div>,
    // 4. settings
    <div key="s" className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={cfg.numberLabel} error={duplicateNumber ? "This number is already used by a saved document." : undefined}>
          {(p) => <Input {...p} value={doc.number} onChange={(e) => update({ number: e.target.value })} />}
        </Field>
        <Field label="Currency">
          {(p) => (
            <Select {...p} value={doc.currency} onChange={(e) => update({ currency: e.target.value })}>
              {[...new Set([doc.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Date">{(p) => <Input {...p} type="date" value={doc.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />}</Field>
        {cfg.dueLabel && <Field label={cfg.dueLabel}>{(p) => <Input {...p} type="date" value={doc.dueDate} onChange={(e) => update({ dueDate: e.target.value })} />}</Field>}
        {kind === "invoice" && <Field label="Payment terms" optional>{(p) => <Input {...p} value={doc.paymentTerms} placeholder="Net 14" onChange={(e) => update({ paymentTerms: e.target.value })} />}</Field>}
        {kind === "receipt" && <Field label="Payment method">{(p) => <Input {...p} value={doc.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value })} />}</Field>}
        <Field label="PO number" optional>{(p) => <Input {...p} value={doc.poNumber} onChange={(e) => update({ poNumber: e.target.value })} />}</Field>
        <Field label="Reference" optional>{(p) => <Input {...p} value={doc.reference} onChange={(e) => update({ reference: e.target.value })} />}</Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} value={doc.status} onChange={(e) => update({ status: e.target.value as BusinessDocument["status"] })}>
              {cfg.statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Taxes</h3>
          <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => {
            const t = { id: crypto.randomUUID(), name: "Tax", rate: 0, compound: false };
            update({ taxes: [...doc.taxes, t], items: doc.items.map((i) => ({ ...i, taxIds: [...i.taxIds, t.id] })) });
          }}>
            Add tax
          </Button>
        </div>
        {doc.taxes.length === 0 && <p className="text-sm text-muted">No tax applied. Add GST, VAT, sales tax or any custom tax.</p>}
        {doc.taxes.map((t) => (
          <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-end gap-2">
            <Field label="Name">{(p) => (
              <>
                <Input {...p} list="tax-presets" value={t.name} onChange={(e) => update({ taxes: doc.taxes.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) })} />
              </>
            )}</Field>
            <Field label="Rate %">{(p) => <NumberInput {...p} label={`${t.name} rate`} value={t.rate} onChange={(rate) => update({ taxes: doc.taxes.map((x) => (x.id === t.id ? { ...x, rate: Math.min(100, rate) } : x)) })} />}</Field>
            <IconButton label={`Remove ${t.name}`} onClick={() => update({ taxes: doc.taxes.filter((x) => x.id !== t.id), items: doc.items.map((i) => ({ ...i, taxIds: i.taxIds.filter((id) => id !== t.id) })) })}>
              <Trash2 className="size-4" />
            </IconButton>
            <label className="col-span-3 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={t.compound} onChange={(e) => update({ taxes: doc.taxes.map((x) => (x.id === t.id ? { ...x, compound: e.target.checked } : x)) })} className="accent-[var(--accent)]" />
              Compound (charged on top of other taxes)
            </label>
          </div>
        ))}
        <datalist id="tax-presets">{TAX_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
        {doc.taxes.length > 0 && (
          <Switch label="Prices include tax" description="Turn on if your item prices already contain tax (tax-inclusive pricing)." checked={doc.pricesIncludeTax} onChange={(pricesIncludeTax) => update({ pricesIncludeTax })} />
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Discount">{() => (
          <div className="flex gap-2">
            <NumberInput label="Document discount" value={doc.discount} onChange={(discount) => update({ discount })} className="flex-1" />
            <Select aria-label="Discount type" value={doc.discountType} onChange={(e) => update({ discountType: e.target.value as "percent" | "amount" })}>
              <option value="percent">%</option>
              <option value="amount">{doc.currency}</option>
            </Select>
          </div>
        )}</Field>
        <Field label="Shipping">{(p) => <NumberInput {...p} label="Shipping" value={doc.shipping} onChange={(shipping) => update({ shipping })} />}</Field>
        {cfg.showPaid && kind !== "receipt" && <Field label="Amount paid">{(p) => <NumberInput {...p} label="Amount paid" value={doc.amountPaid} onChange={(amountPaid) => update({ amountPaid })} />}</Field>}
      </div>
      <div className="flex flex-col gap-2">
        {doc.additionalCharges.map((c) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_8rem_auto] gap-2">
            <Input aria-label="Charge label" value={c.label} placeholder="Handling fee" onChange={(e) => update({ additionalCharges: doc.additionalCharges.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) })} />
            <NumberInput label="Charge amount" value={c.amount} onChange={(amount) => update({ additionalCharges: doc.additionalCharges.map((x) => (x.id === c.id ? { ...x, amount } : x)) })} />
            <IconButton label="Remove charge" onClick={() => update({ additionalCharges: doc.additionalCharges.filter((x) => x.id !== c.id) })}><Trash2 className="size-4" /></IconButton>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="self-start" icon={<Plus className="size-3.5" />} onClick={() => update({ additionalCharges: [...doc.additionalCharges, { id: crypto.randomUUID(), label: "", amount: 0 }] })}>
          Add additional charge
        </Button>
      </div>
      <Field label="Payment instructions" optional>{(p) => <Textarea {...p} value={doc.paymentInstructions} placeholder="Bank name, account number, IBAN / UPI / PayPal…" onChange={(e) => update({ paymentInstructions: e.target.value })} />}</Field>
      <Field label="Notes" optional>{(p) => <Textarea {...p} value={doc.notes} placeholder="Thank you for your business." onChange={(e) => update({ notes: e.target.value })} />}</Field>
      <Field label="Terms & conditions" optional>{(p) => <Textarea {...p} value={doc.terms} onChange={(e) => update({ terms: e.target.value })} />}</Field>
    </div>,
    // 5. design
    <div key="d" className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Template" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={doc.template === t.id} onClick={() => update({ template: t.id })} className={cn("rounded-lg border p-3 text-left transition-colors", doc.template === t.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong")}>
            <span className="block text-sm font-medium">{t.name}</span>
            <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Accent color">{(p) => <input {...p} type="color" value={doc.design.accent} onChange={(e) => update({ design: { ...doc.design, accent: e.target.value } })} className="h-10 w-full cursor-pointer rounded-md border border-border bg-surface p-1" />}</Field>
        <Field label="Font">{(p) => (
          <Select {...p} value={doc.design.font} onChange={(e) => update({ design: { ...doc.design, font: e.target.value as "sans" | "serif" } })}>
            <option value="sans">Sans-serif (Arial-compatible)</option>
            <option value="serif">Serif (Times)</option>
          </Select>
        )}</Field>
        <Field label="Font size">{(p) => (
          <Select {...p} value={doc.design.fontSize} onChange={(e) => update({ design: { ...doc.design, fontSize: Number(e.target.value) } })}>
            {[9, 10, 11, 12].map((s) => <option key={s} value={s}>{s} pt</option>)}
          </Select>
        )}</Field>
        <Field label="Margins">{(p) => (
          <Select {...p} value={doc.design.margin} onChange={(e) => update({ design: { ...doc.design, margin: Number(e.target.value) } })}>
            <option value={36}>Narrow</option>
            <option value={48}>Normal</option>
            <option value={64}>Wide</option>
          </Select>
        )}</Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Page size</span>
          <Segmented label="Page size" value={doc.design.pageSize} onChange={(pageSize) => update({ design: { ...doc.design, pageSize } })} options={[{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }]} />
        </div>
        {doc.logo && <Switch label="Show logo" checked={doc.design.showLogo} onChange={(showLogo) => update({ design: { ...doc.design, showLogo } })} />}
      </div>
      <Field label="Footer" optional>{(p) => <Input {...p} value={doc.footer} placeholder="e.g. Company · Registered office · Website" onChange={(e) => update({ footer: e.target.value })} />}</Field>
    </div>,
    // 6. ready
    <div key="r" className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
        <CircleCheck className="mt-0.5 size-6 text-success" aria-hidden="true" />
        <div>
          <h3 className="font-semibold">{cfg.label} ready</h3>
          <p className="text-sm text-muted">
            {doc.number} · {money(totals.total)} {cfg.showPaid && kind === "invoice" && totals.paid > 0 && `· balance ${money(totals.balance)}`}
          </p>
        </div>
        <Badge className="ml-auto">{STATUS_LABEL[doc.status]}</Badge>
      </div>
      {!doc.to.name && <Notice tone="warning">The {cfg.toLabel.toLowerCase()} name is empty.</Notice>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="lg" icon={<Download className="size-4" />} loading={busy === "pdf"} onClick={() => exportAs("pdf")}>Download PDF</Button>
        <Button size="lg" variant="secondary" icon={<FileText className="size-4" />} loading={busy === "docx"} onClick={() => exportAs("docx")}>Download DOCX</Button>
        <Button size="lg" variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
        <Button size="lg" variant="secondary" icon={<Save className="size-4" />} onClick={save}>{saved ? "Save changes" : "Save to history"}</Button>
      </div>
      <p className="text-xs text-subtle">Saved documents stay in this browser only. Clearing site data removes them.</p>
    </div>,
  ];

  return (
    <BuilderLayout
      editor={
        <div className="flex flex-col gap-6">
          <Stepper label={`${cfg.label} steps`} steps={steps} current={step} onChange={setStep} />
          <section aria-label={steps[step]}>{stepContent[step]}</section>
          <div className="flex justify-between gap-2 border-t border-border pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {step < steps.length - 1 && <Button onClick={() => setStep((s) => s + 1)}>{step === steps.length - 2 ? `Create ${cfg.label.toLowerCase()}` : "Continue"}</Button>}
          </div>
        </div>
      }
      preview={<DocumentPreview model={model} label={`${cfg.label} preview`} />}
    />
  );
}
