import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

/**
 * Cinematic-but-fast page transition: each route change fades the new page
 * in with a slight rise and depth scale (background stays put, content
 * advances). ~0.24s, disabled entirely under prefers-reduced-motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation();
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      key={pathname + search}
      initial={{ opacity: 0, y: 12, scale: 0.995, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
