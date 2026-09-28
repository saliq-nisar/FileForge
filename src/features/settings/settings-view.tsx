"use client";

import type { ReactNode } from "react";
import { Field, Segmented, Select, Switch } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { clearAllCareerData } from "@/features/career/storage";
import { forgetProfile } from "@/features/business/storage";
import { useSettings } from "@/stores/settings-store";
import { toast } from "@/stores/toast-store";
import { useWorkspace } from "@/stores/workspace-store";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border py-8 first:pt-0 last:border-0 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="flex max-w-xl flex-col gap-5">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const s = useSettings();
  const clearWorkspace = useWorkspace((w) => w.clear);

  return (
    <div>
      <Section title="Appearance">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Theme</span>
          <Segmented label="Theme" value={s.theme} onChange={(theme) => s.update({ theme })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} />
        </div>
      </Section>

      <Section title="Processing" description="Defaults used when a tool opens. You can still change them per task.">
        <Field label="Default compression level">
          {(p) => (
            <Select {...p} value={s.defaultCompressionLevel} onChange={(e) => s.update({ defaultCompressionLevel: e.target.value as typeof s.defaultCompressionLevel })}>
              <option value="low">Light (lossless)</option>
              <option value="recommended">Recommended</option>
              <option value="strong">Strong</option>
            </Select>
          )}
        </Field>
        <Field label={<span className="flex justify-between"><span>Default image quality</span><span className="font-normal text-muted">{s.defaultImageQuality}%</span></span>}>
          {(p) => <input {...p} type="range" min={10} max={100} value={s.defaultImageQuality} onChange={(e) => s.update({ defaultImageQuality: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />}
        </Field>
        <Field label="Default image output format">
          {(p) => (
            <Select {...p} value={s.defaultImageFormat} onChange={(e) => s.update({ defaultImageFormat: e.target.value as typeof s.defaultImageFormat })}>
              <option value="original">Same as input</option>
              <option value="jpeg">JPG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Privacy" description="Everything here is stored only in this browser.">
        <Switch label="Record processed files in the workspace" description="Keeps a local list of results (name, size, tool, date)." checked={s.workspaceHistory} onChange={(workspaceHistory) => s.update({ workspaceHistory })} />
        <Switch label="Keep processed files in this browser" description="Stores result files in IndexedDB so you can re-download them from the workspace." checked={s.workspaceKeepFiles} disabled={!s.workspaceHistory} onChange={(workspaceKeepFiles) => s.update({ workspaceKeepFiles })} />
        <Field label="Auto-delete workspace entries" help="Checked each time the workspace opens.">
          {(p) => (
            <Select {...p} value={s.autoDeleteHours} onChange={(e) => s.update({ autoDeleteHours: Number(e.target.value) })}>
              <option value={1}>After 1 hour</option>
              <option value={24}>After 24 hours</option>
              <option value={168}>After 7 days</option>
              <option value={720}>After 30 days</option>
              <option value={0}>Never</option>
            </Select>
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void clearWorkspace().then(() => toast.success("Workspace cleared."))}>Clear workspace</Button>
          <Button variant="secondary" size="sm" onClick={() => { forgetProfile(); toast.success("Saved business details removed."); }}>Forget business details</Button>
          <Button variant="secondary" size="sm" onClick={() => { if (window.confirm("Delete all resumes, cover letters and analyses from this browser?")) { clearAllCareerData(); toast.success("Career data deleted."); } }}>Delete career data</Button>
        </div>
        <p className="text-xs text-subtle">Server-side processing (only for tools marked “Server”) deletes uploaded and processed files as soon as the result is retrieved, and automatically after the retention window otherwise.</p>
      </Section>

      <Section title="Accessibility">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Motion</span>
          <Segmented label="Motion" value={s.motion} onChange={(motion) => s.update({ motion })} options={[{ value: "system", label: "System" }, { value: "reduced", label: "Reduced" }, { value: "full", label: "Full" }]} />
          <p className="text-xs text-subtle">“System” follows your device&apos;s reduced-motion setting.</p>
        </div>
        <Switch label="Keyboard shortcuts" description="Ctrl/⌘ + K opens search; the PDF editor has single-key tool shortcuts." checked={s.shortcutsEnabled} onChange={(shortcutsEnabled) => s.update({ shortcutsEnabled })} />
        <Switch label="Show shortcut hints" checked={s.showShortcutHints} onChange={(showShortcutHints) => s.update({ showShortcutHints })} />
      </Section>

      <div className="pt-4">
        <Button variant="ghost" size="sm" onClick={() => { s.reset(); toast.success("Settings reset to defaults."); }}>Reset all settings</Button>
      </div>
    </div>
  );
}
