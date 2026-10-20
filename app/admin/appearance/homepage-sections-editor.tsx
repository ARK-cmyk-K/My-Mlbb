"use client";

import { useMemo, useState } from "react";
import type { DraftHomepageSection } from "../../lib/content/contracts";
import { APPROVED_HOMEPAGE_SECTION_IDS, homepageSectionDefinition } from "../../lib/content/homepage-sections";
import { updateHomepageSectionsAction } from "../../actions/homepage-sections-actions";

export interface HomepageSectionsEditorProps {
  sections: DraftHomepageSection[];
}

type EditableEntry = {
  sectionId: string;
  isEnabled: boolean;
  position: number;
};

function toEditable(sections: DraftHomepageSection[]): EditableEntry[] {
  const byId = new Map(sections.map((s) => [s.sectionId, s] as const));
  return APPROVED_HOMEPAGE_SECTION_IDS.map((id, index) => {
    const existing = byId.get(id);
    return {
      sectionId: id,
      isEnabled: existing?.isEnabled ?? true,
      position: existing?.position ?? index,
    };
  }).sort((a, b) => a.position - b.position);
}

function moveItem(list: EditableEntry[], fromIndex: number, toIndex: number): EditableEntry[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return list;
  }
  const copy = [...list];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy.map((entry, idx) => ({ ...entry, position: idx }));
}

export function HomepageSectionsEditor({ sections }: HomepageSectionsEditorProps) {
  const initial = useMemo(() => toEditable(sections), [sections]);
  const [entries, setEntries] = useState<EditableEntry[]>(initial);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onMoveUp = (index: number) => {
    setEntries((prev) => moveItem(prev, index, index - 1));
  };

  const onMoveDown = (index: number) => {
    setEntries((prev) => moveItem(prev, index, index + 1));
  };

  const onToggle = (index: number) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, isEnabled: !e.isEnabled } : e))
    );
  };

  const onReset = () => {
    setEntries(initial);
    setError(undefined);
  };

  const onSubmit = async (formData: FormData) => {
    setIsPending(true);
    setError(undefined);
    try {
      await updateHomepageSectionsAction({} as any, formData);
    } catch (e) {
      setError("Failed to save homepage sections");
      setIsPending(false);
    }
  };

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="rounded-md border border-border bg-surface-raised">
        <ul role="list" aria-label="Homepage sections ordering" className="divide-y divide-border">
          {entries.map((entry, index) => {
            const def = homepageSectionDefinition(entry.sectionId);
            const label = def?.label ?? entry.sectionId;
            const description = def?.description ?? "";
            return (
              <li key={entry.sectionId} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => onMoveUp(index)}
                      disabled={index === 0 || isPending}
                      aria-label={`Move ${label} up`}
                      className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveDown(index)}
                      disabled={index === entries.length - 1 || isPending}
                      aria-label={`Move ${label} down`}
                      className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                    >
                      ↓
                    </button>
                  </div>
                  <div>
                    <div className="font-medium">{label}</div>
                    <p className="text-sm text-muted">{description}</p>
                    <input type="hidden" name={`section.${entry.sectionId}.order`} value={index} />
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={`section.${entry.sectionId}.enabled`}
                    checked={entry.isEnabled}
                    onChange={() => onToggle(index)}
                    disabled={isPending}
                  />
                  <span className="text-sm">Enabled</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save homepage sections"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={isPending}
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
