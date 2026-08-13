import { useEffect, useRef } from "react";
import { motion, useMotionValue, useReducedMotion } from "framer-motion";
import { cn } from "@/utils/cn";

interface VoiceOrbProps {
  /** Live AnalyserNode from the actual mic stream — the orb reads REAL levels from it. */
  analyser: AnalyserNode | null;
  /** True while recording — the orb shifts to its warm recording state and pulses. */
  active: boolean;
  size?: number;
  className?: string;
  /** Centered control (the mic toggle). */
  children?: React.ReactNode;
}

/**
 * 3D audio orb for the Voice Studio. While `active`, a rAF loop reads the
 * mic's time-domain data through the AnalyserNode, computes the RMS level,
 * and drives the core scale + glow — so the pulse is real sound, not a fake
 * animation. Idle: slow breathing. Recording: warm accent + live pulse.
 * Under prefers-reduced-motion it stays static.
 */
export function VoiceOrb({ analyser, active, size = 230, className, children }: VoiceOrbProps) {
  const reduced = useReducedMotion();
  const scale = useMotionValue(1);
  const glow = useMotionValue(active ? 0.5 : 0.3);
  const currentRef = useRef(0);

  useEffect(() => {
    glow.set(active ? 0.5 : 0.3);
  }, [active, glow]);

  // Real mic level → orb pulse. Reads the analyser in a rAF loop and smooths
  // the RMS so the orb breathes naturally instead of jittering per-frame.
  useEffect(() => {
    if (!analyser || !active || reduced) return;
    let raf = 0;
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      try {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const target = Math.min(1, rms * 3.2);
        currentRef.current += (target - currentRef.current) * 0.45;
        scale.set(1 + currentRef.current * 0.16);
        glow.set(0.45 + currentRef.current * 0.55);
      } catch {
        /* analyser closed mid-frame — stop the loop */
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, reduced, scale, glow]);

  const coreGradient = active
    ? "radial-gradient(circle at 34% 30%, hsl(0 88% 68% / 0.95), hsl(351 70% 42%) 45%, hsl(340 55% 16%) 75%, hsl(340 45% 8%) 100%)"
    : "radial-gradient(circle at 34% 30%, hsl(var(--primary) / 0.98), hsl(258 74% 46%) 42%, hsl(243 55% 22%) 72%, hsl(240 45% 10%) 100%)";

  return (
    <div className={cn("relative mx-auto", className)} style={{ width: size, height: size, perspective: 1000 }}>
      {/* Ambient glow — brightens with the real level (decorative only) */}
      <motion.div
        aria-hidden="true"
        className="absolute -inset-10 rounded-full blur-3xl"
        style={{
          opacity: glow,
          background: `radial-gradient(circle, ${active ? "hsl(0 84% 60% / 0.35)" : "hsl(var(--primary) / 0.4)"}, transparent 65%)`,
        }}
      />

      {/* Pulsing 3D scene (decorative only) */}
      <motion.div aria-hidden="true" className="relative h-full w-full" style={{ transformStyle: "preserve-3d", scale }}>
        {/* Core sphere */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: coreGradient,
            boxShadow:
              "0 0 80px -16px hsl(var(--primary) / 0.5), 0 0 26px -6px hsl(var(--primary) / 0.3), inset 0 0 40px hsl(var(--primary) / 0.22), inset -16px -20px 54px hsl(240 60% 4% / 0.55)",
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              left: "22%",
              top: "16%",
              width: "30%",
              height: "20%",
              background: "radial-gradient(ellipse, hsl(var(--primary-foreground) / 0.45), transparent 70%)",
              filter: "blur(6px)",
            }}
          />
        </div>

        {/* Level ring — sits just outside the core, tints with the state */}
        <div className="absolute -inset-2 rounded-full border-2" style={{ borderColor: active ? "hsl(0 84% 65% / 0.45)" : "hsl(var(--primary) / 0.3)", boxShadow: "0 0 24px -8px hsl(var(--primary) / 0.4)" }} />

        {/* Orbital rings (shared Nexus Core styling) */}
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          <div className={cn("absolute inset-0", !reduced && "nexus-ring-spin")}>
            <div className="nexus-ring" style={{ transform: "rotateX(74deg)", width: "96%", height: "96%", left: "2%", top: "2%" }} />
            <div className="nexus-node" style={{ left: "47%", top: "0%", width: 8, height: 8, background: active ? "hsl(0 84% 65%)" : "hsl(var(--primary))", boxShadow: active ? "0 0 10px 2px hsl(0 84% 60% / 0.6)" : "0 0 10px 2px hsl(var(--primary) / 0.6)" }} />
          </div>
        </div>
        <div className="absolute -inset-4" style={{ transformStyle: "preserve-3d" }}>
          <div className={cn("absolute inset-0", !reduced && "nexus-ring-spin-rev")}>
            <div className="nexus-ring" style={{ transform: "rotateX(106deg)", borderColor: "hsl(var(--info) / 0.2)", width: "88%", height: "88%", left: "6%", top: "6%" }} />
          </div>
        </div>
      </motion.div>

      {/* Centered control (mic toggle) sits above the orb */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">{children}</div>
    </div>
  );
}
