"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/misc";
import { getTool } from "@/lib/tools/registry";
import { ToolRunner } from "./tool-runner";

// Heavy workspaces are code-split and only loaded on their own pages.
const PdfEditor = dynamic(() => import("@/features/editor/pdf-editor").then((m) => m.PdfEditor), {
  ssr: false,
  loading: () => <LoadingState label="Loading editor…" />,
});
const PageOrganizer = dynamic(() => import("@/features/pdf/page-organizer").then((m) => m.PageOrganizer), {
  ssr: false,
  loading: () => <LoadingState label="Loading organizer…" />,
});
const FormFiller = dynamic(() => import("@/features/pdf/form-filler").then((m) => m.FormFiller), {
  ssr: false,
  loading: () => <LoadingState label="Loading form filler…" />,
});
const OcrTool = dynamic(() => import("@/features/ocr/ocr-tool").then((m) => m.OcrTool), {
  ssr: false,
  loading: () => <LoadingState label="Loading OCR…" />,
});

export function ToolWorkspace({ slug }: { slug: string }) {
  const tool = getTool(slug);
  if (!tool) return null;
  switch (tool.ui) {
    case "editor":
      return <PdfEditor initialTool={tool.editorTool} />;
    case "organizer":
      return <PageOrganizer />;
    case "form-filler":
      return <FormFiller />;
    case "ocr":
      return <OcrTool />;
    default:
      return <ToolRunner slug={slug} />;
  }
}
