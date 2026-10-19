import { requireAdmin } from "../../auth/requireAdmin";
import { PlaceholderPanel } from "../_components/placeholder-panel";

export default async function PreviewPage() {
  await requireAdmin();

  return (
    <PlaceholderPanel
      title="Preview"
      description="Preview the public showcase at common viewport sizes before publishing."
      task="04-04"
      points={[
        "Responsive preview frames for mobile, tablet and desktop.",
        "Renders published-safe content from the draft working set.",
        "No public URL is affected until a release is published.",
      ]}
    />
  );
}
