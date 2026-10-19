import { requireAdmin } from "../../auth/requireAdmin";
import { PlaceholderPanel } from "../_components/placeholder-panel";

export default async function ImportExportPage() {
  await requireAdmin();

  return (
    <PlaceholderPanel
      title="Import and export"
      description="Bulk-load collection data and produce restorable backups."
      task="03-03 to 03-06"
      points={[
        "CSV import with a dry run and validation report before anything is written.",
        "Merge-resolution workflow for conflicting rows.",
        "JSON backup export with a media manifest.",
        "SQL export and restore safeguards that never run destructively by default.",
      ]}
    />
  );
}
