// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileDropzone } from "@/components/files/file-dropzone";
import { OptionFields } from "@/components/tools/option-fields";
import { ResultPanel } from "@/components/tools/result-panel";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useProcessing } from "@/hooks/use-processing";
import { AppError } from "@/lib/errors";
import { getTool } from "@/lib/tools/registry";
import { useToastStore } from "@/stores/toast-store";
import { PNG_1x1, fileFrom, makePdf } from "../helpers";

beforeEach(() => useToastStore.setState({ toasts: [] }));
afterEach(cleanup);

describe("upload flow", () => {
  it("accepts files through the file picker and validates them by content", async () => {
    const { result } = renderHook(() => useFileSelection({ accept: ["pdf"], multiple: true, maxFiles: 5 }));
    render(<FileDropzone accept={["pdf"]} multiple onFiles={(f) => void result.current.add(f)} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toContain(".pdf");

    const good = fileFrom(await makePdf(1), "report.pdf", "application/pdf");
    const fake = fileFrom(PNG_1x1, "not-really.pdf", "application/pdf");
    await act(async () => {
      fireEvent.change(input, { target: { files: [good, fake] } });
    });
    await waitFor(() => expect(result.current.files).toHaveLength(1));
    expect(result.current.files[0].format.kind).toBe("pdf");
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.tone === "error" && t.message.includes("not-really.pdf"))).toBe(true);
  });

  it("supports drag and drop with a visible drag state", async () => {
    const onFiles = vi.fn();
    render(<FileDropzone accept={["jpeg", "png"]} multiple onFiles={onFiles} />);
    const zone = screen.getByText(/Drop your images here/).closest("div")!.parentElement!;
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    expect(screen.getByText("Release to add")).toBeInTheDocument();
    const img = fileFrom(PNG_1x1, "a.png", "image/png");
    fireEvent.drop(zone, { dataTransfer: { files: [img] } });
    expect(onFiles).toHaveBeenCalledWith([img]);
  });

  it("enforces single-file tools and reorders multi-file selections", async () => {
    const { result } = renderHook(() => useFileSelection({ accept: ["pdf"], multiple: true, maxFiles: 10 }));
    const a = fileFrom(await makePdf(1), "a.pdf");
    const b = fileFrom(await makePdf(1), "b.pdf");
    await act(() => result.current.add([a, b]));
    act(() => result.current.reorder(0, 1));
    expect(result.current.files.map((f) => f.file.name)).toEqual(["b.pdf", "a.pdf"]);

    const single = renderHook(() => useFileSelection({ accept: ["pdf"], multiple: false }));
    await act(() => single.result.current.add([a]));
    await act(() => single.result.current.add([b]));
    expect(single.result.current.files.map((f) => f.file.name)).toEqual(["b.pdf"]);
  });
});

describe("processing flow", () => {
  it("reports progress and completes", async () => {
    const { result } = renderHook(() => useProcessing());
    let finish!: () => void;
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.run(async ({ onProgress }) => {
        onProgress({ ratio: 1, message: "Merging" });
        await new Promise<void>((r) => (finish = r));
        return { files: [] };
      });
    });
    await waitFor(() => expect(result.current.state.phase).toBe("running"));
    await act(async () => {
      finish();
      await promise;
    });
    expect(result.current.state.phase).toBe("done");
  });

  it("shows safe error messages and supports cancellation", async () => {
    const { result } = renderHook(() => useProcessing());
    await act(() => result.current.run(async () => { throw new AppError("CORRUPTED_PDF"); }));
    expect(result.current.state).toEqual({ phase: "error", message: "This PDF appears to be corrupted or invalid." });

    await act(() => result.current.run(async () => { throw new TypeError("secret internal detail at /srv/app.js:12"); }));
    expect(result.current.state).toEqual({ phase: "error", message: "We couldn't process this file. Please try again." });

    act(() => void result.current.run(() => new Promise(() => undefined)));
    act(() => result.current.cancel());
    expect(result.current.state.phase).toBe("idle");
  });
});

describe("options", () => {
  it("renders declarative options and hides dependent fields", () => {
    const tool = getTool("split-pdf")!;
    const onChange = vi.fn();
    const { rerender } = render(<OptionFields fields={tool.options!} values={{ mode: "ranges", ranges: "", every: 2 }} onChange={onChange} />);
    expect(screen.getByLabelText(/Page ranges/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Pages per file/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Every N pages" }));
    expect(onChange).toHaveBeenCalledWith("mode", "every");
    rerender(<OptionFields fields={tool.options!} values={{ mode: "every", ranges: "", every: 2 }} onChange={onChange} />);
    expect(screen.getByLabelText(/Pages per file/)).toBeInTheDocument();
  });
});

describe("download flow", () => {
  it("shows size comparison, notes and downloads with the right name", async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const blob = new Blob([new Uint8Array(1_200_000)], { type: "application/pdf" });
    render(
      <ResultPanel
        result={{ files: [{ name: "report-compressed.pdf", mime: "application/pdf", blob, size: blob.size }], notes: ["3 images optimized."] }}
        inputs={[new File([new Uint8Array(4_800_000)], "report.pdf")]}
        label="Compressed PDF"
        showSizes
        onReset={() => undefined}
      />,
    );
    expect(screen.getByText("4.8 MB")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("3 images optimized.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    expect(click).toHaveBeenCalled();
    expect(created[0].type).toBe("application/pdf");
    expect(document.querySelector("a[download]")).toBeNull(); // temporary link removed
  });
});
