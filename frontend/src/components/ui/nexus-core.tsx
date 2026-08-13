import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { cn } from "@/utils/cn";

export type NexusCoreState = "idle" | "thinking" | "success" | "error";

interface NexusCoreProps {
  /** Gentle pulse while an AI task is running. */
  active?: boolean;
  /** Visual state tied to REAL app state — never faked. */
  state?: NexusCoreState;
  className?: string;
  /** Diameter in px. */
  size?: number;
}

/**
 * The Nexus Core — a subtle 3D intelligence object built with pure CSS 3D
 * transforms + Framer Motion (no WebGL dependency). Layered sphere with
 * orbital rings and nodes, gentle mouse parallax, extremely slow idle
 * rotation, and a soft pulse when `active`. Visual state follows real app
 * state: `thinking` accelerates the orbits, `success`/`error` tint the glow
 * (cyan / red). Falls back to a static object under prefers-reduced-motion.
 */
export function NexusCore({ active = false, state = "idle", className, size = 260 }: NexusCoreProps) {
  const reduced = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 55, damping: 18 });
  const springY = useSpring(rotateY, { stiffness: 55, damping: 18 });
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const isThinking = state === "thinking";
  const glowColor =
    state === "success"
      ? "hsl(162 88% 56% / 0.4)"
      : state === "error"
        ? "hsl(0 85% 62% / 0.42)"
        : "hsl(var(--primary) / 0.6)";

  const onMouseMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 16);
    rotateX.set(-py * 12);
  };

  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        resetTilt();
      }}
      aria-hidden="true"
      className={cn("relative select-none", className)}
      style={{ width: size, height: size, perspective: 1100 }}
    >
      {/* Ambient glow behind the object */}
      <div
        className="absolute -inset-8 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${glowColor}, transparent 65%)`,
          opacity: hovered ? 0.9 : state === "success" || state === "error" ? 0.85 : isThinking ? 0.8 : 0.6,
          transition: "opacity 0.4s ease",
        }}
      />

      {/* Floating + tilting 3D scene */}
      <motion.div
        animate={reduced ? undefined : { y: [0, -9, 0] }}
        transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d", rotateX: springX, rotateY: springY }}
      >
        {/* The core sphere */}
        <motion.div
          animate={
            (active || isThinking) && !reduced
              ? { scale: [1, 1.035, 1], opacity: [0.92, 1, 0.92] }
              : { scale: hovered && !reduced ? 1.04 : 1 }
          }
          transition={(active || isThinking) && !reduced ? { duration: isThinking ? 1.6 : 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.35 }}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 28%, hsl(var(--primary) / 0.98), hsl(258 74% 46%) 38%, hsl(243 55% 22%) 72%, hsl(240 45% 10%) 100%)",
            boxShadow:
              `${state === "success" ? "0 0 100px -18px hsl(162 88% 56% / 0.55)" : state === "error" ? "0 0 100px -18px hsl(0 85% 62% / 0.55)" : "0 0 90px -18px hsl(var(--primary) / 0.6)"}, 0 0 30px -6px hsl(var(--primary) / 0.35), inset 0 0 44px hsl(var(--primary) / 0.22), inset -18px -22px 60px hsl(240 60% 4% / 0.55)`,
          }}
        >
          {/* Specular highlight */}
          <div
            className="absolute rounded-full"
            style={{
              left: "22%",
              top: "16%",
              width: "30%",
              height: "20%",
              background: "radial-gradient(ellipse, hsl(var(--primary-foreground) / 0.5), transparent 70%)",
              filter: "blur(6px)",
            }}
          />
        </motion.div>

        {/* Orbital ring A — tilted, slow spin (accelerates while thinking) */}
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          <div className={cn("absolute inset-0", !reduced && (isThinking ? "nexus-ring-spin-fast" : "nexus-ring-spin"))}>
            <div
              className="nexus-ring"
              style={{ transform: "rotateX(74deg)", width: "92%", height: "92%", left: "4%", top: "4%" }}
            />
            {/* Nodes riding the orbit */}
            <div
              className="nexus-node"
              style={{ left: "47%", top: "0%", width: 9, height: 9 }}
            />
            <div
              className="nexus-node"
              style={{ left: "47%", top: "96%", width: 6, height: 6, opacity: 0.7 }}
            />
          </div>
        </div>

        {/* Orbital ring B — counter-rotating, wider (accelerates while thinking) */}
        <div className="absolute -inset-4" style={{ transformStyle: "preserve-3d" }}>
          <div className={cn("absolute inset-0", !reduced && (isThinking ? "nexus-ring-spin-rev-fast" : "nexus-ring-spin-rev"))}>
            <div
              className="nexus-ring"
              style={{ transform: "rotateX(106deg)", borderColor: "hsl(var(--info) / 0.22)", width: "88%", height: "88%", left: "6%", top: "6%" }}
            />
            <div
              className="nexus-node"
              style={{ left: "50%", top: "-2%", width: 7, height: 7, background: "hsl(var(--info))", boxShadow: "0 0 10px 2px hsl(var(--info) / 0.55)" }}
            />
          </div>
        </div>

        {/* Equatorial ring C — horizontal plane */}
        <div className="absolute inset-2" style={{ transformStyle: "preserve-3d" }}>
          <div className={cn("absolute inset-0", !reduced && "nexus-ring-spin")}>
            <div
              className="nexus-ring"
              style={{ transform: "rotateX(90deg)", borderColor: "hsl(190 90% 55% / 0.18)", boxShadow: "0 0 18px -8px hsl(190 90% 55% / 0.3), inset 0 0 12px -8px hsl(190 90% 55% / 0.25)" }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
