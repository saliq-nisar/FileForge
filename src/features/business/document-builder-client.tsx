"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/misc";

/** Rendered only in the browser: the builder reads saved documents from local storage. */
export const DocumentBuilderClient = dynamic(() => import("./document-builder").then((m) => m.DocumentBuilder), {
  ssr: false,
  loading: () => <LoadingState />,
});
