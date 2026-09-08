import { Badge } from "@/components/ui/badge";
import { LOGIN_PITCH } from "@/constants/labels";

export function FeaturePills() {
  return (
    <ul className="flex flex-wrap gap-2">
      {LOGIN_PITCH.features.map((feature) => (
        <li key={feature}>
          <Badge variant="brand">{feature}</Badge>
        </li>
      ))}
    </ul>
  );
}
