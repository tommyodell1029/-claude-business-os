"use client";
// Arc-reactor voice orb on a 2D canvas (no WebGL). Animates by state and live audio level; static under
// prefers-reduced-motion; pauses when the page is hidden. DPR capped at 2 to stay smooth on an iPhone.
import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const COLORS: Record<OrbState, [number, number, number]> = {
  idle: [56, 200, 240],
  listening: [90, 235, 255],
  thinking: [150, 220, 255],
  speaking: [70, 225, 255],
};

export default function Orb({ state, level, reducedMotion }: { state: OrbState; level: () => number; reducedMotion: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let rot = 0;
    let smooth = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = el.getBoundingClientRect();
      el.width = Math.round(r.width * dpr);
      el.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const w = el.clientWidth, h = el.clientHeight;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4;
      const [r, g, b] = COLORS[st];
      const target = st === "listening" || st === "speaking" ? Math.min(1, level() * 3) : st === "thinking" ? 0.35 : 0.12;
      smooth += (target - smooth) * (reducedMotion ? 1 : Math.min(1, dt * 12));
      const speed = st === "thinking" ? 2.4 : st === "idle" ? 0.25 : 0.8;
      if (!reducedMotion) rot += dt * speed;
      const c = (a: number) => `rgba(${r},${g},${b},${a})`;

      ctx.clearRect(0, 0, w, h);
      // core glow
      const coreR = R * (0.22 + 0.16 * smooth);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      grad.addColorStop(0, "rgba(235,255,255,0.95)");
      grad.addColorStop(0.25, c(0.85));
      grad.addColorStop(1, c(0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineCap = "round";
      ctx.shadowColor = c(0.9);
      ctx.shadowBlur = 12;
      // outer ring
      ctx.strokeStyle = c(0.55 + 0.35 * smooth);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // segmented ring (rotates)
      const segs = 12;
      ctx.lineWidth = R * 0.07;
      ctx.strokeStyle = c(0.75);
      for (let i = 0; i < segs; i++) {
        const a0 = rot + (i / segs) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.7, a0, a0 + (Math.PI * 2) / segs * 0.62);
        ctx.stroke();
      }
      // inner counter-rotating arcs
      ctx.lineWidth = 2;
      ctx.strokeStyle = c(0.6);
      for (let i = 0; i < 3; i++) {
        const a0 = -rot * 1.6 + (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.5 + 0.05 * smooth), a0, a0 + Math.PI * 0.45);
        ctx.stroke();
      }
      // level ticks on the outer ring
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      const ticks = 48;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2 + rot * 0.3;
        const amp = st === "listening" || st === "speaking" ? smooth * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + rot * 3))) : 0.08;
        const r0 = R * 0.8, r1 = r0 + R * 0.1 * amp + 2;
        ctx.strokeStyle = c(0.35 + 0.5 * amp);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (reducedMotion) draw(performance.now());
      else if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());

    resize();
    start();
    const ro = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(performance.now());
    });
    ro.observe(el);
    const redraw = () => draw(performance.now());
    el.addEventListener("jv-redraw", redraw);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("jv-redraw", redraw);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [level, reducedMotion]);

  // Reduced motion: redraw once per state change instead of animating.
  useEffect(() => {
    if (!reducedMotion) return;
    canvas.current?.dispatchEvent(new Event("jv-redraw"));
  }, [state, reducedMotion]);

  return <canvas ref={canvas} className="jv-orb" role="img" aria-label={`Jarvis is ${state}`} />;
}
