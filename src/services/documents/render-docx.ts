import type { Align, Block, DocumentModel, Inline } from "./model";

type Docx = typeof import("docx");

const PT = 2; // docx sizes are half-points
const TWIP = 20; // 1pt = 20 twips

function color(hex: string | undefined): string | undefined {
  return hex?.replace("#", "").toUpperCase();
}

/** Render a document model to a native Word document (real text, real tables, standard headings). */
export async function renderDocx(model: DocumentModel): Promise<Blob> {
  const d: Docx = await import("docx");
  const t = model.theme;
  const font = t.font === "sans" ? "Arial" : "Times New Roman";

  const align = (a?: Align) => (a === "center" ? d.AlignmentType.CENTER : a === "right" ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT);
  const runs = (items: Inline[], size = t.size, baseColor = t.text) =>
    items.map((r) => new d.TextRun({ text: r.text, bold: r.bold, italics: r.italic, color: color(r.color ?? baseColor), size: size * PT, font }));

  const noBorders = {
    top: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const convert = (blocks: Block[]): Array<InstanceType<Docx["Paragraph"]> | InstanceType<Docx["Table"]>> => {
    const out: Array<InstanceType<Docx["Paragraph"]> | InstanceType<Docx["Table"]>> = [];
    for (const b of blocks) {
      switch (b.type) {
        case "heading": {
          const size = b.size ?? (b.level === 1 ? t.size * 2 : b.level === 2 ? t.size * 1.2 : t.size * 1.05);
          out.push(
            new d.Paragraph({
              heading: b.level === 1 ? d.HeadingLevel.HEADING_1 : b.level === 2 ? d.HeadingLevel.HEADING_2 : d.HeadingLevel.HEADING_3,
              alignment: align(b.align),
              spacing: { before: b.level === 1 ? 0 : 200, after: 80 },
              border: b.rule ? { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: color(b.color ?? t.accent) ?? "000000", space: 1 } } : undefined,
              children: [new d.TextRun({ text: b.uppercase ? b.text.toUpperCase() : b.text, bold: true, size: size * PT, color: color(b.color ?? t.text), font })],
            }),
          );
          break;
        }
        case "paragraph":
          out.push(new d.Paragraph({ alignment: align(b.align), spacing: { after: (b.spaceAfter ?? t.size * 0.45) * TWIP }, children: runs(b.runs, b.size ?? t.size, b.color ?? t.text) }));
          break;
        case "list":
          for (const item of b.items) out.push(new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: runs(item, b.size ?? t.size) }));
          break;
        case "table": {
          const total = b.columns.reduce((a, c) => a + c.width, 0);
          const size = b.size ?? t.size * 0.95;
          const cell = (text: string, i: number, header: boolean) =>
            new d.TableCell({
              width: { size: Math.round((b.columns[i].width / total) * 100), type: d.WidthType.PERCENTAGE },
              shading: header && b.headerBg ? { type: d.ShadingType.CLEAR, color: "auto", fill: color(b.headerBg) } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new d.Paragraph({ alignment: align(b.columns[i].align), children: [new d.TextRun({ text, bold: header, size: size * PT, font, color: color(header ? (b.headerColor ?? t.text) : t.text) })] })],
            });
          out.push(
            new d.Table({
              width: { size: 100, type: d.WidthType.PERCENTAGE },
              rows: [
                new d.TableRow({ tableHeader: true, children: b.columns.map((c, i) => cell(c.header, i, true)) }),
                ...b.rows.map((r) => new d.TableRow({ children: r.map((c, i) => cell(c, i, false)) })),
              ],
            }),
          );
          out.push(new d.Paragraph({ children: [] }));
          break;
        }
        case "columns": {
          const total = b.columns.reduce((a, c) => a + c.width, 0);
          out.push(
            new d.Table({
              width: { size: 100, type: d.WidthType.PERCENTAGE },
              borders: noBorders,
              rows: [
                new d.TableRow({
                  children: b.columns.map(
                    (c) =>
                      new d.TableCell({
                        width: { size: Math.round((c.width / total) * 100), type: d.WidthType.PERCENTAGE },
                        borders: noBorders,
                        children: (() => {
                          const inner = convert(c.blocks);
                          return inner.length ? inner : [new d.Paragraph({ children: [] })];
                        })(),
                      }),
                  ),
                }),
              ],
            }),
          );
          break;
        }
        case "keyValue":
          b.rows.forEach(([k, v], i) => {
            const last = b.emphasizeLast && i === b.rows.length - 1;
            out.push(
              new d.Paragraph({
                alignment: b.align === "right" ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
                spacing: { after: 40 },
                children: [
                  new d.TextRun({ text: `${k}: `, color: color(t.muted), bold: last, size: (b.size ?? t.size) * PT * (last ? 1.15 : 1), font }),
                  new d.TextRun({ text: v, bold: last, size: (b.size ?? t.size) * PT * (last ? 1.15 : 1), font }),
                ],
              }),
            );
          });
          break;
        case "spacer":
          out.push(new d.Paragraph({ spacing: { after: b.size * TWIP }, children: [] }));
          break;
        case "divider":
          out.push(new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: color(b.color ?? "#d4d4d8") ?? "D4D4D8", space: 1 } }, children: [] }));
          break;
        case "image": {
          try {
            const [header, data] = b.src.split(",");
            const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
            out.push(
              new d.Paragraph({
                alignment: align(b.align),
                children: [new d.ImageRun({ type: header.includes("png") ? "png" : "jpg", data: bytes, transformation: { width: b.width * (96 / 72), height: b.height * (96 / 72) } })],
              }),
            );
          } catch {
            /* skip unreadable image */
          }
          break;
        }
        case "banner":
          out.push(
            new d.Paragraph({
              shading: { type: d.ShadingType.CLEAR, color: "auto", fill: color(b.background) },
              alignment: align(b.align),
              spacing: { after: 0 },
              children: [new d.TextRun({ text: b.title, bold: true, color: color(b.color), size: t.size * 1.9 * PT, font })],
            }),
          );
          if (b.subtitle) {
            out.push(new d.Paragraph({ shading: { type: d.ShadingType.CLEAR, color: "auto", fill: color(b.background) }, alignment: align(b.align), spacing: { after: 200 }, children: [new d.TextRun({ text: b.subtitle, color: color(b.color), size: t.size * PT, font })] }));
          }
          break;
      }
    }
    return out;
  };

  const doc = new d.Document({
    title: model.title,
    creator: model.author ?? "FileForge",
    subject: model.subject,
    keywords: model.keywords?.join(", "),
    styles: { default: { document: { run: { font, size: t.size * PT, color: color(t.text) } } } },
    sections: [
      {
        properties: {
          page: {
            size: model.pageSize === "letter" ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 },
            margin: { top: t.margin * TWIP, bottom: t.margin * TWIP, left: t.margin * TWIP, right: t.margin * TWIP },
          },
        },
        // Footer text is never critical; ATS parsers may skip footers.
        footers: model.footer
          ? { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ text: model.footer, size: t.size * 0.8 * PT, color: color(t.muted), font })] })] }) }
          : undefined,
        children: convert(model.blocks),
      },
    ],
  });
  return d.Packer.toBlob(doc);
}
