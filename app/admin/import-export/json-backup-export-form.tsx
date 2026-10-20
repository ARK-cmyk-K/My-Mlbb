"use client";

import { useActionState, useEffect, useState } from "react";

import { exportBackupAction, type ExportBackupState } from "../../actions/export-actions";

const INITIAL_STATE: ExportBackupState = {};

export function JsonBackupExportForm() {
  const [state, formAction, pending] = useActionState(
    exportBackupAction,
    INITIAL_STATE
  );
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (state.export && !downloaded) {
      const json = JSON.stringify(state.export, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date(state.export.generatedAt).toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `mlbb-backup-v${state.export.formatVersion}-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      window.setTimeout(() => setDownloaded(true), 0);
    }
    if (state.error) {
      window.setTimeout(() => setDownloaded(false), 0);
    }
  }, [state, downloaded]);

  const resetDownload = (): void => {
    setDownloaded(false);
  };

  return (
    <div className="mt-8 space-y-5 rounded-lg border border-border bg-surface-raised p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          JSON backup export (admin-only)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Exports documented application data and a media manifest containing
          stable IDs, object paths/URLs (public only when explicitly included),
          MIME types, sizes, checksums if available, and reference relationships.
          Never exposes secrets, auth tokens, service-role keys, or unrelated user
          data. Downloads require server-side admin authorization.
        </p>
      </div>

      {state.error ? (
        <div
          role="alert"
          className="rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground"
        >
          {state.error}
        </div>
      ) : null}

      {state.export ? (
        <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground">
          <p>
            Backup generated successfully (format v{state.export.formatVersion},
            scope: {state.export.scope}, includes drafts:{" "}
            {state.export.includesDrafts ? "yes" : "no"}, includes published:{" "}
            {state.export.includesPublished ? "yes" : "no"}).
          </p>
          <p className="mt-2 text-muted">
            Totals: {Object.entries(state.export.totals)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")}
          </p>
          <button
            type="button"
            onClick={resetDownload}
            className="mt-3 inline-flex items-center rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          >
            Download again
          </button>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Export scope</span>
            <select
              name="scope"
              defaultValue="everything"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="everything">Everything (drafts + published)</option>
              <option value="draft">Drafts only</option>
              <option value="published">Published only</option>
              <option value="working-set">Working set (drafts, excludes archived)</option>
            </select>
            <span className="mt-1 block text-xs text-muted">
              Drafts include private metadata and working state. Published
              snapshots are read-only projections.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="includePublicUrls"
              className="mt-1 h-4 w-4 rounded border-border bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            <span>
              <span className="font-medium text-foreground">
                Include public storage URLs
              </span>
              <span className="mt-1 block text-xs text-muted">
                Only for media in the public bucket (&quot;showcase-public&quot;). Draft
                objects never receive public URLs. Not included by default.
              </span>
            </span>
          </label>
        </div>

        <div className="text-xs text-muted">
          <p>
            The media manifest includes: stable IDs, storage bucket, object paths,
            kind, MIME type, size (bytes), width/height, checksum SHA-256 if
            available, alt text, publication state, timestamps, public URL
            (optional), and reference relationships to content entities.
          </p>
          <p className="mt-2">
            Export format/version is documented in the JSON (formatVersion).
            Streaming is approximated with bounded chunked fetches; output is
            serialized as JSON in one download.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
        >
          {pending ? "Generating backup..." : "Download JSON backup"}
        </button>
      </form>
    </div>
  );
}
