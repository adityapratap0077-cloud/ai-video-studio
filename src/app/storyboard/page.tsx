import { PhasePlaceholder } from "@/components/PhasePlaceholder";
import { IconStoryboard } from "@/components/icons";

export default function StoryboardPage() {
  return (
    <PhasePlaceholder
      title="Storyboard"
      phase="Arrives in Phase 2"
      blurb="The storyboard is where the script becomes shots — one board per scene, with framing, motion and transitions spelled out before anything gets generated."
      items={[
        "Scene-by-scene boards generated from your script",
        "Shot descriptions with camera, framing and movement",
        "Regenerate any single board without touching the rest",
        "Aspect-ratio previews for 9:16, 16:9 and 1:1",
      ]}
      icon={IconStoryboard}
    />
  );
}
