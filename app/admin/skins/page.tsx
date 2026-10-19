import { requireAdmin } from "../../auth/requireAdmin";
import { PlaceholderPanel } from "../_components/placeholder-panel";

export default async function SkinsPage() {
  await requireAdmin();

  return (
    <PlaceholderPanel
      title="Skins"
      description="Manage the skin collection, including rarity, series and acquisition history."
      task="03-02"
      points={[
        "Skin fields: hero, rarity, series, splash art, variant, ownership and acquisition milestone.",
        "Favourite tagging feeds the public explorer filters.",
        "Draft-only editing; changes reach the public site through a release.",
      ]}
    />
  );
}
