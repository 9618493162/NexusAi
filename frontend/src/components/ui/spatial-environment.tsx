import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";

interface Mote {
  left: string;
  top: string;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: number;
}

/** Deterministic dust motes (no Math.random in render). */
function buildMotes(count: number): Mote[] {
  return Array.from({ length: count }, (_, i) => ({
    left: `${(i * 41 + 13) % 100}%`,
    top: `${(i * 67 + 5) % 90}%`,
    size: 2 + (i % 3),
    opacity: 0.18 + (i % 4) * 0.1,
    duration: 11 + (i % 5) * 3,
    delay: (i % 7) * 1.4,
    drift: ((i % 5) - 2) * 8,
  }));
}

/**
 * The NexusAI spatial environment — a fixed background plane of depth:
 * ambient light orbs, a faint perspective grid floor, a readability
 * vignette, and slow dust motes. Pure CSS 3D + transforms, so it stays on
 * the GPU and never competes with content. All animation is killed by the
 * global prefers-reduced-motion rule (and the mote layer is skipped entirely
 * when reduced motion is requested).
 */
export function SpatialEnvironment() {
  const reduced = useReducedMotion();
  const motes = useMemo(() => buildMotes(16), []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Ambient light orbs */}
      <div className="spatial-orb spatial-orb-a" />
      <div className="spatial-orb spatial-orb-b" />
      <div className="spatial-orb spatial-orb-c" />
      {/* Perspective grid floor */}
      <div className="spatial-grid" />
      {/* Dust motes */}
      {!reduced &&
        motes.map((m, i) => (
          <span
            key={i}
            className="spatial-dust"
            style={
              {
                left: m.left,
                top: m.top,
                width: m.size,
                height: m.size,
                "--dust-o": m.opacity,
                "--dust-d": `${m.duration}s`,
                "--dust-delay": `${m.delay}s`,
                "--dust-x": `${m.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      {/* Readability vignette */}
      <div className="spatial-vignette" />
    </div>
  );
}
