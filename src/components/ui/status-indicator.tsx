import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  status: "online" | "offline" | "warning" | "loading";
  label?: string;
  className?: string;
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  const dotColor = {
    online: "bg-bull",
    offline: "bg-bear",
    warning: "bg-neutral-signal",
    loading: "bg-primary animate-pulse-glow",
  }[status];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("h-2 w-2 rounded-full", dotColor)} />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
