import JSZip from "jszip";
import { expect, test } from "@playwright/test";
import { downloadedBytes, pageCount, pdfBuffer, pngBuffer } from "./fixtures";

test.describe("dashboard & search", () => {
  test("hero search and Ctrl+K palette find tools", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "All your files. One powerful workspace." })).toBeVisible();
    await page.getByRole("combobox", { name: "What do you want to do?" }).first().fill("compress");
    await expect(page.getByRole("option", { name: /Compress PDF/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.locator("body").click();
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.type("merge");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/tools\/merge-pdf$/);
    await expect(page.getByRole("heading", { level: 1, name: "Merge PDF" })).toBeVisible();
  });
});

test.describe("PDF tools (in-browser processing)", () => {
  test("PDF upload + merge produces a combined PDF", async ({ page }) => {
    await page.goto("/tools/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([
      { name: "first.pdf", mimeType: "application/pdf", buffer: await pdfBuffer(2, "First") },
      { name: "second.pdf", mimeType: "application/pdf", buffer: await pdfBuffer(3, "Second") },
    ]);
    await expect(page.getByRole("list", { name: "Selected files" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Merge PDF" }).click();
    await expect(page.getByText(/Your merged pdf is ready/i)).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Download PDF/ }).click()]);
    expect(download.suggestedFilename()).toBe("first-merged.pdf");
    expect(await pageCount(await downloadedBytes(download))).toBe(5);
  });

  test("PDF compression reports honest size results", async ({ page }) => {
    await page.goto("/tools/compress-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: await pdfBuffer(4) });
    await page.getByRole("button", { name: "Compress PDF" }).click();
    await expect(page.getByText("Original size")).toBeVisible();
    await expect(page.getByText("New size")).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Download PDF/ }).click()]);
    expect(await pageCount(await downloadedBytes(download))).toBe(4);
  });

  test("rejects a file whose content doesn't match", async ({ page }) => {
    await page.goto("/tools/split-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf at all") });
    await expect(page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: /isn't supported/ })).toBeVisible();
  });
});

test.describe("rendering & OCR", () => {
  test("PDF → JPG renders each page to a ZIP of images", async ({ page }) => {
    await page.goto("/tools/pdf-to-jpg");
    await page.locator('input[type="file"]').setInputFiles({ name: "slides.pdf", mimeType: "application/pdf", buffer: await pdfBuffer(2) });
    await page.getByRole("button", { name: "PDF to JPG" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download all as ZIP" }).click()]);
    const zip = await JSZip.loadAsync(await downloadedBytes(download));
    expect(Object.keys(zip.files).sort()).toEqual(["slides-page-1.jpg", "slides-page-2.jpg"]);
  });

  test("OCR extracts text from a scanned-style PDF entirely in the browser", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("http://localhost") && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) external.push(r.url());
    });
    await page.goto("/tools/ocr");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await pdfBuffer(1, "INVOICE NUMBER") });
    await page.getByRole("button", { name: "Extract text" }).click();
    await expect(page.getByRole("heading", { name: "Extracted text" })).toBeVisible({ timeout: 80_000 });
    await expect(page.getByLabel("Extracted text", { exact: true })).toContainText(/INVOICE NUMBER/i);
    expect(external, "OCR must not contact third-party servers").toEqual([]);
  });
});

test.describe("image tools", () => {
  test("image conversion PNG → JPG", async ({ page }) => {
    await page.goto("/tools/png-to-jpg");
    await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: pngBuffer() });
    await page.getByRole("button", { name: "PNG to JPG" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Download/ }).click()]);
    expect(download.suggestedFilename()).toBe("photo.jpg");
    const bytes = await downloadedBytes(download);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("batch processing: compress several images and download all as ZIP", async ({ page }) => {
    await page.goto("/tools/compress-image");
    await page.locator('input[type="file"]').setInputFiles(
      [1, 2, 3].map((i) => ({ name: `image-${i}.png`, mimeType: "image/png", buffer: pngBuffer(200 + i * 10, 150) })),
    );
    await expect(page.getByRole("list", { name: "Selected files" }).getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Compress Image" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download all as ZIP" }).click()]);
    const zip = await JSZip.loadAsync(await downloadedBytes(download));
    expect(Object.keys(zip.files).filter((n) => !zip.files[n].dir)).toHaveLength(3);
  });
});

test.describe("business & career", () => {
  test("create an invoice and download the PDF", async ({ page }) => {
    await page.goto("/business/invoice/new");
    await page.getByLabel("Name", { exact: true }).first().fill("Forge Studio");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Name", { exact: true }).first().fill("Acme Corp");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Description").first().fill("Consulting");
    await page.getByLabel("Price", { exact: true }).first().fill("150");
    await page.getByLabel("Qty", { exact: true }).first().fill("4");
    await expect(page.getByRole("region", { name: "Invoice preview" }).getByText("Acme Corp")).toBeVisible();
    await page.getByRole("button", { name: /Ready$/ }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^Invoice-INV-\d{4}-\d{4}\.pdf$/);
    expect(await pageCount(await downloadedBytes(download))).toBe(1);
  });

  test("quick resume produces an estimated ATS score", async ({ page }) => {
    await page.goto("/career/resume/quick");
    await page.getByLabel("Name").fill("Jane Doe");
    await page.getByLabel("Target job").fill("Frontend Engineer");
    await page.getByLabel("Email").fill("jane@example.com");
    await page.getByLabel("Experience").fill("Frontend Engineer at Acme, 2020 – Present\nBuilt a React design system used by 40 engineers\nReduced load time by 35%");
    await page.getByLabel("Skills").fill("React, TypeScript, CSS");
    await page.getByRole("button", { name: "Create my resume" }).click();
    await expect(page.getByRole("heading", { name: "Resume ready" })).toBeVisible();
    await expect(page.getByText(/Estimated ATS compatibility/)).toBeVisible();
  });
});

test.describe("PDF editor", () => {
  test("adds text and exports a PDF", async ({ page }) => {
    await page.goto("/tools/edit-pdf");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "form.pdf", mimeType: "application/pdf", buffer: await pdfBuffer(2) });
    await expect(page.getByRole("toolbar", { name: "Editing tools" })).toBeVisible();
    await page.getByRole("button", { name: /^Text/ }).click();
    const firstPage = page.locator("[data-page-index='0']");
    await firstPage.click({ position: { x: 120, y: 160 } });
    await page.keyboard.type("Signed off");
    await page.keyboard.press("Escape");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export PDF/ }).click()]);
    expect(await pageCount(await downloadedBytes(download))).toBe(2);
  });
});
