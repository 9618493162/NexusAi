import { motion } from "framer-motion";

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <motion.div
        className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}
