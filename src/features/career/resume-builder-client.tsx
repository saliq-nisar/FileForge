"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/misc";

/** Rendered only in the browser: drafts and saved versions live in browser storage. */
export const ResumeBuilderClient = dynamic(() => import("./resume-builder").then((m) => m.ResumeBuilder), {
  ssr: false,
  loading: () => <LoadingState />,
});
