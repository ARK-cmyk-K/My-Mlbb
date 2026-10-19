import { requireAdmin } from "../../auth/requireAdmin";
import { PlaceholderPanel } from "../_components/placeholder-panel";

export default async function MediaPage() {
  await requireAdmin();

  return (
    <PlaceholderPanel
      title="Media"
      description="Portraits and splash art stored in Supabase Storage with safe, explicit access policies."
      task="02-04"
      points={[
        "Bucket and storage-policy setup is applied in task 02-04.",
        "Only intentionally published media is readable by anonymous visitors.",
        "Media referenced by content cannot be deleted by accident.",
      ]}
    />
  );
}
