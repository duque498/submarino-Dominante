import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function ScoreBadge({ score, size = "md", showLabel = false, className }: ScoreBadgeProps) {
  const colorClass = score >= 70 ? "text-bull border-bull/30 bg-bull/10" :
                     score >= 50 ? "text-neutral-signal border-neutral-signal/30 bg-neutral-signal/10" :
                     "text-bear border-bear/30 bg-bear/10";

  const sizeClass = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-9 w-9 text-sm",
    lg: "h-14 w-14 text-lg",
  }[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn(
        "flex items-center justify-center rounded-full border font-mono font-bold",
        colorClass,
        sizeClass
      )}>
        {score}
      </div>
      {showLabel && (
        <span className={cn("text-xs font-medium", colorClass)}>
          {score >= 70 ? "Forte" : score >= 50 ? "Moderado" : "Fraco"}
        </span>
      )}
    </div>
  );
}
