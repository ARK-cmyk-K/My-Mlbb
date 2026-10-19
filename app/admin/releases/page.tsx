import { requireAdmin } from "../../auth/requireAdmin";
import { PlaceholderPanel } from "../_components/placeholder-panel";

export default async function ReleasesPage() {
  await requireAdmin();

  return (
    <PlaceholderPanel
      title="Releases"
      description="Review changes, snapshot the draft set, publish and roll back safely."
      task="04-05 to 04-06"
      points={[
        "Diffs between the current draft and the last published release.",
        "Immutable snapshots so history is never lost.",
        "Transactional publish, optional scheduling and controlled rollback.",
      ]}
    />
  );
}
