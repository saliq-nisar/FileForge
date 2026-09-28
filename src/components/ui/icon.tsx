import {
  Archive, Award, Briefcase, Code, Contrast, Copy, Crop, Droplet, Eraser, FileArchive, FileImage, FileOutput, FilePen,
  FilePlus, FileSpreadsheet, FileText, FileType, FileUser, FlipHorizontal, FormInput, Gauge, GitCompare, GraduationCap,
  Handshake, Highlighter, Image, ImagePlus, Info, Layers, LayoutGrid, ListChecks, ListOrdered, Lock, LockOpen, Mail,
  Merge, MessageSquare, Minimize2, Package, PaintBucket, PanelTop, PenLine, Pencil, Presentation, Receipt, ReceiptText,
  Repeat, RotateCw, Scaling, ScanText, Scissors, Shapes, Sheet, Shield, ShoppingCart, Signature, Sparkles, Square, Stamp,
  Target, Trash2, Type, Wallet, Zap, LayoutDashboard, FolderOpen, Settings, type LucideIcon,
} from "lucide-react";

/** Registry icons by name. Explicit imports keep the icon bundle small. */
const ICONS: Record<string, LucideIcon> = {
  archive: Archive, award: Award, briefcase: Briefcase, code: Code, contrast: Contrast, copy: Copy, crop: Crop,
  droplet: Droplet, eraser: Eraser, "file-archive": FileArchive, "file-image": FileImage, "file-output": FileOutput,
  "file-pen": FilePen, "file-plus": FilePlus, "file-spreadsheet": FileSpreadsheet, "file-text": FileText, "file-type": FileType,
  "file-user": FileUser, "flip-horizontal": FlipHorizontal, "form-input": FormInput, gauge: Gauge, "git-compare": GitCompare,
  "graduation-cap": GraduationCap, handshake: Handshake, highlighter: Highlighter, image: Image, "image-plus": ImagePlus,
  info: Info, layers: Layers, "layout-grid": LayoutGrid, "list-checks": ListChecks, "list-ordered": ListOrdered, lock: Lock,
  unlock: LockOpen, mail: Mail, merge: Merge, "message-square": MessageSquare, minimize: Minimize2, package: Package,
  "paint-bucket": PaintBucket, "panel-top": PanelTop, pen: PenLine, pencil: Pencil, presentation: Presentation,
  receipt: Receipt, "receipt-text": ReceiptText, repeat: Repeat, "rotate-cw": RotateCw, scaling: Scaling,
  "scan-text": ScanText, scissors: Scissors, shapes: Shapes, sheet: Sheet, shield: Shield, "shopping-cart": ShoppingCart,
  signature: Signature, sparkles: Sparkles, square: Square, stamp: Stamp, target: Target, trash: Trash2, text: FileText,
  type: Type, wallet: Wallet, zap: Zap, "layout-dashboard": LayoutDashboard, "folder-open": FolderOpen, settings: Settings,
};

export function ToolIcon({ name, className, size = 18 }: { name: string; className?: string; size?: number }) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon aria-hidden="true" className={className} size={size} strokeWidth={1.75} />;
}
