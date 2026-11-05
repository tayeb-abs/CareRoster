import type { LucideIcon } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { translateText } from "@/lib/i18n";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "mint",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: "mint" | "blue" | "amber" | "rose";
}) {
  const { language } = useLocale();
  return (
    <article className="metric-card">
      <div className={`metric-icon metric-${tone}`}><Icon size={19} strokeWidth={1.9} /></div>
      <span className="metric-label">{translateText(label, language)}</span>
      <strong className="metric-value">{typeof value === "string" ? translateText(value, language) : value}</strong>
      <span className="metric-detail">{translateText(detail, language)}</span>
    </article>
  );
}
