import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/utils/cn";

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color?: string; // tailwind text/bg classes for the icon chip
  trend?: number; // percent change, positive/negative
  index?: number;
}

export function StatCard({ icon: Icon, label, value, color = "text-primary bg-primary/10", trend, index = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3, ease: "easeOut" }}
      className="card-surface card-hover p-5"
    >
      <div className="flex items-start justify-between">
        <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", color)}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
        {typeof trend === "number" && trend !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              trend > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}
          >
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </motion.div>
  );
}
