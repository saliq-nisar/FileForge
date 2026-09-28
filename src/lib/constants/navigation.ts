export interface NavLink {
  label: string;
  href: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  href?: string;
  children?: NavLink[];
}

/** Main navigation (sidebar + mobile drawer). */
export const NAVIGATION: NavGroup[] = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: "/" },
  {
    id: "pdf",
    label: "PDF Tools",
    icon: "file-text",
    children: [
      { label: "Compress", href: "/tools/compress-pdf" },
      { label: "Merge", href: "/tools/merge-pdf" },
      { label: "Split", href: "/tools/split-pdf" },
      { label: "Edit", href: "/tools/edit-pdf" },
      { label: "Convert", href: "/tools#conversion" },
      { label: "Sign", href: "/tools/sign-pdf" },
      { label: "OCR", href: "/tools/ocr" },
      { label: "Annotate", href: "/tools/annotate-pdf" },
      { label: "All PDF tools", href: "/tools#pdf" },
    ],
  },
  {
    id: "image",
    label: "Image Tools",
    icon: "image",
    children: [
      { label: "Compress", href: "/tools/compress-image" },
      { label: "Resize", href: "/tools/resize-image" },
      { label: "Convert", href: "/tools/convert-image" },
      { label: "Edit", href: "/tools#image" },
    ],
  },
  {
    id: "document",
    label: "Document Tools",
    icon: "file-type",
    children: [
      { label: "Convert", href: "/tools#document" },
      { label: "Extract", href: "/tools/docx-to-text" },
      { label: "Generate", href: "/business" },
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: "briefcase",
    children: [
      { label: "Invoices", href: "/business/invoice" },
      { label: "Quotes", href: "/business/quote" },
      { label: "Receipts", href: "/business/receipt" },
      { label: "Purchase Orders", href: "/business/purchase-order" },
      { label: "Proposals", href: "/business/templates/proposal" },
    ],
  },
  {
    id: "career",
    label: "Career",
    icon: "graduation-cap",
    children: [
      { label: "Resume Builder", href: "/career/resume" },
      { label: "ATS Checker", href: "/career/ats" },
      { label: "Cover Letter", href: "/career/cover-letter" },
      { label: "Resume Analyzer", href: "/career/analyzer" },
    ],
  },
  { id: "workspace", label: "Workspace", icon: "folder-open", href: "/workspace" },
];

export const SITE = {
  name: "FileForge",
  tagline: "Everything you need to work with PDFs, images and documents.",
};
