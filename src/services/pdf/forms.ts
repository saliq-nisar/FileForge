import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import { loadPdf, savePdf } from "./document";

export type FormFieldDescriptor =
  | { kind: "text"; name: string; value: string; multiline: boolean; maxLength?: number; readOnly: boolean }
  | { kind: "checkbox"; name: string; value: boolean; readOnly: boolean }
  | { kind: "select"; name: string; value: string; options: string[]; readOnly: boolean }
  | { kind: "radio"; name: string; value: string; options: string[]; readOnly: boolean };

export type FormValues = Record<string, string | boolean>;

export async function readFormFields(bytes: Uint8Array): Promise<FormFieldDescriptor[]> {
  const doc = await loadPdf(bytes);
  const out: FormFieldDescriptor[] = [];
  for (const field of doc.getForm().getFields()) {
    const name = field.getName();
    const readOnly = field.isReadOnly();
    if (field instanceof PDFTextField) {
      out.push({ kind: "text", name, value: field.getText() ?? "", multiline: field.isMultiline(), maxLength: field.getMaxLength(), readOnly });
    } else if (field instanceof PDFCheckBox) {
      out.push({ kind: "checkbox", name, value: field.isChecked(), readOnly });
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      out.push({ kind: "select", name, value: field.getSelected()[0] ?? "", options: field.getOptions(), readOnly });
    } else if (field instanceof PDFRadioGroup) {
      out.push({ kind: "radio", name, value: field.getSelected() ?? "", options: field.getOptions(), readOnly });
    }
  }
  return out;
}

export async function fillForm(bytes: Uint8Array, values: FormValues, flatten: boolean): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values) || field.isReadOnly()) continue;
    const v = values[name];
    if (field instanceof PDFTextField) {
      const text = String(v);
      const max = field.getMaxLength();
      field.setText(max ? text.slice(0, max) : text);
    } else if (field instanceof PDFCheckBox) {
      if (v) field.check();
      else field.uncheck();
    } else if ((field instanceof PDFDropdown || field instanceof PDFOptionList) && typeof v === "string" && v) {
      if (field.getOptions().includes(v)) field.select(v);
    } else if (field instanceof PDFRadioGroup && typeof v === "string" && v) {
      if (field.getOptions().includes(v)) field.select(v);
    }
  }
  if (flatten) form.flatten();
  else form.updateFieldAppearances();
  return savePdf(doc);
}
