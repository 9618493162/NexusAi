import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function PageLoader() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-primary to-indigo-500 text-primary-foreground shadow-popover"
      >
        <Sparkles className="h-6 w-6" strokeWidth={2} />
      </motion.div>
      <div className="relative h-6 w-6">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
      </div>
    </div>
  );
}
