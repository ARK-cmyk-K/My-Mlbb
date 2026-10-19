import { requireAdmin } from "../../auth/requireAdmin";
import { PlaceholderPanel } from "../_components/placeholder-panel";

export default async function AppearancePage() {
  await requireAdmin();

  return (
    <PlaceholderPanel
      title="Appearance"
      description="Tokenised theming, homepage composition and a safe subset of custom CSS."
      task="04-01 to 04-03"
      points={[
        "Appearance settings are driven by the shared design tokens, not hard-coded colours.",
        "Homepage sections can be reordered and hidden.",
        "Custom CSS is validated before it can be applied.",
      ]}
    />
  );
}
