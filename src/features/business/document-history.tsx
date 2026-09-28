"use client";

import { useMemo, useState } from "react";
import { useStorageVersion } from "@/lib/storage/local";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, MoreHorizontal, Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";
import { IconButton, buttonClasses } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Input, Select } from "@/components/ui/form";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/stores/toast-store";
import { buildBusinessModel } from "@/templates/invoices";
import { computeTotals, effectiveStatus, formatMoney } from "./calc";
import { KIND_CONFIG, STATUS_LABEL, type BusinessDocKind, type BusinessDocument, type DocStatus } from "./model";
import { businessRepository, suggestNumber } from "./storage";

const TONE: Record<DocStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral", sent: "info", paid: "success", partial: "warning", overdue: "danger", cancelled: "neutral",
};

type Sort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "customer";

export function DocumentHistory({ kind }: { kind: BusinessDocKind }) {
  const cfg = KIND_CONFIG[kind];
  const router = useRouter();
  const storageVersion = useStorageVersion();
  const docs = useMemo(() => (storageVersion === null ? null : businessRepository.list(kind)), [storageVersion, kind]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DocStatus>("all");
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<Sort>("date-desc");


  const rows = useMemo(() => {
    const list = (docs ?? []).map((d) => {
      const totals = computeTotals(d);
      return { doc: d, totals, status: effectiveStatus(d, totals) };
    });
    const q = query.trim().toLowerCase();
    return list
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !customer || r.doc.to.name === customer)
      .filter((r) => (!from || r.doc.issueDate >= from) && (!to || r.doc.issueDate <= to))
      .filter((r) => !q || [r.doc.number, r.doc.to.name, r.doc.to.email, r.doc.reference, ...r.doc.items.map((i) => i.description)].join(" ").toLowerCase().includes(q))
      .sort((a, b) => {
        switch (sort) {
          case "date-asc": return a.doc.issueDate.localeCompare(b.doc.issueDate);
          case "amount-desc": return b.totals.total - a.totals.total;
          case "amount-asc": return a.totals.total - b.totals.total;
          case "customer": return a.doc.to.name.localeCompare(b.doc.to.name);
          default: return b.doc.issueDate.localeCompare(a.doc.issueDate) || b.doc.updatedAt - a.doc.updatedAt;
        }
      });
  }, [docs, query, status, customer, from, to, sort]);

  const customers = useMemo(() => [...new Set((docs ?? []).map((d) => d.to.name).filter(Boolean))].sort(), [docs]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: docs?.length ?? 0 };
    for (const d of docs ?? []) {
      const s = effectiveStatus(d, computeTotals(d));
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [docs]);

  const duplicate = (d: BusinessDocument) => {
    const copy: BusinessDocument = { ...structuredClone(d), id: crypto.randomUUID(), number: suggestNumber(kind), status: kind === "receipt" ? "paid" : "draft", amountPaid: 0, createdAt: Date.now(), updatedAt: Date.now() };
    businessRepository.save(copy);
    toast.success(`Duplicated as ${copy.number}.`);
    router.push(`/business/${kind}/${copy.id}`);
  };
  const remove = (d: BusinessDocument) => {
    if (!window.confirm(`Delete ${cfg.label.toLowerCase()} ${d.number}? This can't be undone.`)) return;
    businessRepository.remove(d.id);
    toast.success(`${cfg.label} deleted.`);
  };
  const download = async (d: BusinessDocument) => {
    const { downloadDocument } = await import("@/services/documents/export");
    await downloadDocument(buildBusinessModel(d), "pdf", `${cfg.label}-${d.number}`);
  };
  const setDocStatus = (d: BusinessDocument, s: DocStatus) => {
    const totals = computeTotals(d);
    businessRepository.save({ ...d, status: s, amountPaid: s === "paid" ? totals.total / totals.factor : d.amountPaid });
  };

  if (docs === null) return null;
  if (docs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState icon={<Receipt className="size-6" />} title={`No ${cfg.plural.toLowerCase()} yet`} description={`Create your first ${cfg.label.toLowerCase()} — saved documents appear here (stored in this browser only).`} action={<Link href={`/business/${kind}/new`} className={buttonClasses()}>Create {cfg.label.toLowerCase()}</Link>} />
      </div>
    );
  }

  const tabs = (["all", ...cfg.statuses] as const).map((s) => ({ value: s, label: s === "all" ? "All" : STATUS_LABEL[s], count: counts[s] ?? 0 }));

  return (
    <div className="flex flex-col gap-4">
      <Tabs label="Filter by status" tabs={tabs} value={status} onChange={setStatus} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input aria-label="Search" placeholder="Search number, customer, item…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Customer" value={customer} onChange={(e) => setCustomer(e.target.value)}>
          <option value="">All customers</option>
          {customers.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="amount-desc">Highest amount</option>
          <option value="amount-asc">Lowest amount</option>
          <option value="customer">Customer A–Z</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No documents match these filters.</p>
      ) : (
        <>
          {/* Table on larger screens, cards on mobile */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Number</th>
                  <th className="px-4 py-2.5 font-medium">{cfg.toLabel}</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ doc, totals, status: s }) => (
                  <tr key={doc.id} className="hover:bg-bg-subtle/60">
                    <td className="px-4 py-3 font-medium"><Link href={`/business/${kind}/${doc.id}`} className="hover:underline">{doc.number || "—"}</Link></td>
                    <td className="px-4 py-3">{doc.to.name || <span className="text-subtle">—</span>}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{doc.issueDate}</td>
                    <td className="px-4 py-3"><Badge tone={TONE[s]}>{STATUS_LABEL[s]}</Badge></td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.total, doc.currency)}</td>
                    <td className="px-2 py-3 text-right"><RowMenu doc={doc} kind={kind} onDuplicate={duplicate} onDelete={remove} onDownload={download} onStatus={setDocStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map(({ doc, totals, status: s }) => (
              <li key={doc.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                <Link href={`/business/${kind}/${doc.id}`} className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">{doc.number} <Badge tone={TONE[s]}>{STATUS_LABEL[s]}</Badge></p>
                  <p className="truncate text-xs text-muted">{doc.to.name || "—"} · {doc.issueDate}</p>
                  <p className="mt-0.5 text-sm tabular-nums">{formatMoney(totals.total, doc.currency)}</p>
                </Link>
                <RowMenu doc={doc} kind={kind} onDuplicate={duplicate} onDelete={remove} onDownload={download} onStatus={setDocStatus} />
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href={`/business/${kind}/new`} className={buttonClasses("secondary", "md", "self-start")}>
        <Plus className="size-4" aria-hidden="true" /> New {cfg.label.toLowerCase()}
      </Link>
    </div>
  );
}

function RowMenu({ doc, kind, onDuplicate, onDelete, onDownload, onStatus }: { doc: BusinessDocument; kind: BusinessDocKind; onDuplicate: (d: BusinessDocument) => void; onDelete: (d: BusinessDocument) => void; onDownload: (d: BusinessDocument) => Promise<void>; onStatus: (d: BusinessDocument, s: DocStatus) => void }) {
  const router = useRouter();
  const cfg = KIND_CONFIG[kind];
  return (
    <Dropdown
      label={`Actions for ${doc.number}`}
      items={[
        { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => router.push(`/business/${kind}/${doc.id}`) },
        { label: "Download PDF", icon: <Download className="size-4" />, onSelect: () => void onDownload(doc) },
        { label: "Duplicate", icon: <Copy className="size-4" />, onSelect: () => onDuplicate(doc) },
        ...cfg.statuses.filter((s) => s !== doc.status && s !== "overdue" && s !== "partial").map((s) => ({ label: `Mark as ${STATUS_LABEL[s].toLowerCase()}`, onSelect: () => onStatus(doc, s) })),
        { label: "Delete", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => onDelete(doc) },
      ]}
      trigger={(p) => (
        <IconButton {...p} size="sm" label={`Actions for ${doc.number}`}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      )}
    />
  );
}

