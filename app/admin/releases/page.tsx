import { requireAdmin } from "../../auth/requireAdmin";
import { invalidateAfterPublish } from "../../lib/cdn";
import { listReleaseSnapshots } from "../../actions/release-actions";
import { PlaceholderPanel } from "../_components/placeholder-panel";

interface SnapshotItem {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
}

export default async function ReleasesPage() {
  await requireAdmin();

  // Load available snapshots for the rollback UI
  const snapshots = await listReleaseSnapshots();

  return (
    <PlaceholderPanel
      title="Releases"
      description="Review changes, snapshot the draft set, publish and roll back safely."
      task="04-06"
      points={[
        "Diffs between the current draft and the last published release.",
        "Immutable snapshots so history is never lost.",
        "Transactional publish, optional scheduling and controlled rollback.",
      ]}
    >
      <h1 className="text-2xl font-bold mb-6">Releases</h1>

      {/* Publish form */}
      <div className="mb-8">
        <h2 className="text-xl font-medium mb-4">Publish New Release</h2>
        <form
          onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const formData = new FormData(e.target as HTMLFormElement);
            const state = await (await import("../../actions/release-actions"))
              .publishReleaseAction({ error: "" }, formData);
            if (state.error) {
              alert("Publish failed: " + state.error);
            } else {
              window.location.href = "/admin/releases?notice=published";
            }
          }}
          className="space-y-4 max-w-2xl"
        >
          <div>
            <label
              htmlFor="release-label"
              className="block text-sm font-medium mb-2"
            >
              Release label
            </label>
            <input
              id="release-label"
              type="text"
              name="releaseLabel"
              placeholder="e.g. Version 1.0"
              className="w-full border rounded p-2"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-primary text-white font-medium py-2 px-4 rounded hover:bg-primary/90"
          >
            Publish Release
          </button>
        </form>
      </div>

      {/* Current release status */}
      {/** TODO: fetch and display current active release status **/}

      {/* Rollback section */}
      <div className="mt-8">
        <h2 className="text-xl font-medium mb-4">Rollback to Prior Snapshot</h2>

        {snapshots.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No snapshots available. Publish a release first.
          </p>
        )}

        <form
          onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const formData = new FormData(e.target as HTMLFormElement);
            const snapshotId = String(formData.get("targetSnapshotId") ?? "").trim();
            if (!snapshotId) {
              alert("Please select a snapshot to roll back to.");
              return;
            }
            const state = await (
              await import("../../actions/release-actions")
            ).rollbackReleaseAction({ error: "" }, formData);
            if (state.error) {
              alert("Rollback failed: " + state.error);
            } else {
              window.location.href = "/admin/releases?notice=rolledback";
            }
          }}
          className="space-y-4 max-w-2xl"
        >
          <label
            htmlFor="rollback-snapshot"
            className="block text-sm font-medium mb-2"
          >
            Select snapshot to roll back to
          </label>
          <select
            id="rollback-snapshot"
            name="targetSnapshotId"
            className="w-full border rounded p-2"
            required
          >
            <option value="">-- Select a snapshot --</option>
            {snapshots.map((s) => (
              <option
                key={s.id}
                value={s.id}
                title={s.label ? `v${s.version}: ${s.label}` : `v${s.version}`}
              >
                {s.label ? `v${s.version}: ${s.label}` : `v${s.version}`}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="bg-destructive text-white font-medium py-2 px-4 rounded hover:bg-destructive/90"
          >
            Rollback Release
          </button>
        </form>
      </div>

      {/* CDN cache invalidation notice */}
      <div className="mt-8 p-4 rounded bg-yellow-50/50 backdrop-blur-sm">
        <p className="text-sm text-yellow-800">
          <strong>CDN cache invalidation:</strong> Not configured. If you use a CDN
          (e.g., Vercel, Cloudflare), you will need to manually invalidate the cache
          after publishing or rolling back to ensure visitors see the updated content.
        </p>
      </div>
    </PlaceholderPanel>
  );
}