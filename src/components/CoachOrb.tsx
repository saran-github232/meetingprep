import { useEffect, useRef } from "react";
import type { CoachVisualState } from "../../electron/ai/interviewCoach";
import { COACH_STATE_LABEL } from "../../electron/ai/interviewCoach";

// Point-cloud sphere on a near-black panel — an original visualization inspired by the
// reference image's dark, minimal, red/orange dotted orb. Represents the coach's activity
// state (Listening / Analyzing / Generating / Ready) through rotation speed, breathing, and
// brightness rather than layout changes, so nothing shifts while it runs.
//
// Performance: one fixed pool of ~800 points drawn as tiny arcs per frame — cheap on canvas
// 2D even at 60fps. States only change motion parameters (never the pool size), the loop
// pauses while the window is hidden, and prefers-reduced-motion renders a single static frame.

const POINT_COUNT = 800;

interface OrbPoint {
  // Unit-sphere position (Fibonacci distribution for even spacing)…
  x: number;
  y: number;
  z: number;
  // …plus a per-point phase so breathing/wobble doesn't move the whole shell in lockstep.
  phase: number;
}

function fibonacciSphere(n: number): OrbPoint[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const points: OrbPoint[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius, phase: (i % 97) / 97 });
  }
  return points;
}

// Motion per state: radians/sec spin, breathing amplitude, surface wobble, and overall
// brightness. Analyzing spins hard and wobbles; Generating breathes strongly; Ready is calm.
const STATE_MOTION: Record<CoachVisualState, { spin: number; breathe: number; wobble: number; glow: number }> = {
  idle: { spin: 0.06, breathe: 0.012, wobble: 0.02, glow: 0.72 },
  listening: { spin: 0.18, breathe: 0.045, wobble: 0.05, glow: 1 },
  transcribing: { spin: 0.12, breathe: 0.03, wobble: 0.08, glow: 0.92 },
  analyzing: { spin: 0.55, breathe: 0.02, wobble: 0.12, glow: 1 },
  generating: { spin: 0.25, breathe: 0.08, wobble: 0.06, glow: 1 },
  ready: { spin: 0.08, breathe: 0.028, wobble: 0.03, glow: 0.9 },
};

// Dot color ramps from deep ember (back of the sphere) to bright orange-red (front),
// matching the reference image's red/orange point cloud.
function dotColor(depth: number, glow: number): string {
  // depth 0 (back) → 1 (front)
  const r = Math.round(150 + 105 * depth);
  const g = Math.round(28 + 92 * depth * glow);
  const b = Math.round(18 + 34 * depth);
  return `rgb(${r},${g},${b})`;
}

export default function CoachOrb({ state, className }: { state: CoachVisualState; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points = fibonacciSphere(POINT_COUNT);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let running = true;
    let t = 8; // start mid-cycle so the sphere isn't perfectly axis-aligned on open
    let last = performance.now();

    function resize() {
      const rect = parent!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.round(rect.width * dpr));
      canvas!.height = Math.max(1, Math.round(rect.height * dpr));
    }
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.36;

      // Near-black panel like the reference, with a faint warm halo behind the sphere.
      ctx!.fillStyle = "#0b0a09";
      ctx!.fillRect(0, 0, w, h);
      const motion = STATE_MOTION[stateRef.current];
      const halo = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.7);
      halo.addColorStop(0, `rgba(120, 40, 20, ${0.22 * motion.glow})`);
      halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx!.fillStyle = halo;
      ctx!.fillRect(0, 0, w, h);

      const spin = t * motion.spin;
      const cos = Math.cos(spin);
      const sin = Math.sin(spin);
      // Slight fixed tilt so the rotation reads as 3D rather than a flat disc.
      const tilt = 0.35;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      for (const p of points) {
        const wobble = 1 + motion.wobble * Math.sin(t * 2.1 + p.phase * Math.PI * 2);
        const breathe = 1 + motion.breathe * Math.sin(t * 1.1);
        const x1 = (p.x * cos + p.z * sin) * wobble * breathe;
        const z1 = -p.x * sin + p.z * cos;
        // Tilt around X: y/z mix, then project orthographically — dots on the front half
        // get bigger, brighter, and more orange; back-half dots shrink and dim.
        const y2 = p.y * cosT - z1 * sinT;
        const z2 = p.y * sinT + z1 * cosT;
        const depth = (z2 + 1) / 2; // 0 back → 1 front
        const px = cx + x1 * radius;
        const py = cy + y2 * radius;
        const size = (0.7 + 1.5 * depth) * dpr * 0.5;
        ctx!.globalAlpha = (0.18 + 0.8 * depth) * motion.glow;
        ctx!.fillStyle = dotColor(depth, motion.glow);
        ctx!.beginPath();
        ctx!.arc(px, py, size, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // Hidden window: skip the draw, keep the loop alive so resume is instant.
      if (!document.hidden) {
        t += dt;
        draw();
      }
      raf = requestAnimationFrame(frame);
    }

    if (reduced) {
      draw(); // single static frame; the state label below still communicates activity
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border border-white/10 shadow-card ${className ?? ""}`}
      style={{ background: "#0b0a09" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center pb-4">
        <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11.5px] font-medium tracking-wide text-orange-200/90 backdrop-blur-sm">
          {COACH_STATE_LABEL[state]}
          {(state === "listening" || state === "generating" || state === "analyzing") && (
            <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-orange-400" />
          )}
        </span>
      </div>
    </div>
  );
}
