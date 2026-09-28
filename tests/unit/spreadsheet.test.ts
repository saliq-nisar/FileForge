// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildXlsx, columnIndex, columnName, detectDelimiter, parseCsv, readXlsx, toCsv } from "@/services/document/spreadsheet";

describe("CSV", () => {
  it("parses quoted fields, escaped quotes and embedded newlines", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n"multi\nline",2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["multi\nline", "2", "3"],
    ]);
  });

  it("detects delimiters", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
  });

  it("quotes when needed and neutralizes formula injection", () => {
    expect(toCsv([["a,b", 'q"', "=SUM(A1)", "-5", 3]])).toBe('"a,b","q""",\'=SUM(A1),-5,3');
  });
});

describe("XLSX", () => {
  it("round-trips cells through our writer and reader", async () => {
    const blob = await buildXlsx([{ name: "Data", rows: [["Name", "Qty", "Code"], ["Apple", "3", "007"], ["Pear", 4.5, null]] }], { convertNumbers: true });
    const sheets = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
    expect(sheets[0].name).toBe("Data");
    expect(sheets[0].rows[1]).toEqual(["Apple", 3, "007"]);
    expect(sheets[0].rows[2][1]).toBe(4.5);
  });

  it("converts column names", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(27)).toBe("AB");
    expect(columnIndex("AB")).toBe(27);
  });
});
