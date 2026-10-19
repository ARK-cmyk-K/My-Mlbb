import { requireAdmin } from "../../auth/requireAdmin";
import { PlaceholderPanel } from "../_components/placeholder-panel";

export default async function HeroesPage() {
  await requireAdmin();

  return (
    <PlaceholderPanel
      title="Heroes"
      description="Create, edit, archive and order the heroes shown on the public showcase."
      task="03-01"
      points={[
        "Hero fields: name, slug, roles, specialty, portrait, mastery, matches and win rate.",
        "Draft-only editing; nothing is public until a release is published.",
        "Archiving keeps history instead of deleting records.",
      ]}
    />
  );
}
