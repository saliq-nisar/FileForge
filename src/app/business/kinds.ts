import type { BusinessDocKind } from "@/features/business/model";

export const BUSINESS_KINDS: BusinessDocKind[] = ["invoice", "quote", "receipt", "purchase-order"];

export function isBusinessKind(v: string): v is BusinessDocKind {
  return (BUSINESS_KINDS as string[]).includes(v);
}
