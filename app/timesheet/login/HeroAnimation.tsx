"use client";

import { useEffect, useRef } from "react";
import figA from "./figures/fig-a.svg";
import figB from "./figures/fig-b.svg";
import figC from "./figures/fig-c.svg";
import figD from "./figures/fig-d.svg";

// Decorative background for the dark side of the login page: white circles sweep in from the right while a few
// stick figures run across. It sits behind the text and is skipped for people who prefer reduced motion.

type Circle = { x: number; y: number; size: number };

// run = ms to cross the panel, spin = ms per turn (0 = no spin)
const RUNNERS = [
  { src: figA.src, top: "0%", run: 1500, spin: 0, flat: true },
  { src: figB.src, top: "10%", run: 3000, spin: 2000, flat: false },
  { src: figC.src, top: "20%", run: 5000, spin: 1000, flat: false },
  { src: figA.src, top: "25%", run: 2500, spin: 1500, flat: false },
  { src: figA.src, top: "35%", run: 2000, spin: 300, flat: false },
];

const FRAMES = 500;

export default function HeroAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let circles: Circle[] = [];
    let frame = 0;
    let raf = 0;

    function start() {
      cancelAnimationFrame(raf);
      const { width, height } = parent!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.round(width));
      canvas!.height = Math.max(1, Math.round(height));
      frame = 0;
      circles = Array.from({ length: 300 }, () => ({
        x: canvas!.width * 1.2 + Math.random() * canvas!.width * 1.8,
        y: -canvas!.height * 0.2 + Math.random() * canvas!.height * 1.2,
        size: canvas!.width / 1000,
      }));
      raf = requestAnimationFrame(draw);
    }

    function draw() {
      frame++;
      const step = canvas!.width / 80;
      const grow = canvas!.width / 1000;
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = "#ffffff";

      for (const c of circles) {
        if (frame < 65) {
          c.x -= step;
          c.size += grow;
        } else if (frame < FRAMES) {
          c.x -= step * 0.02;
          c.size += grow * 0.2;
        }
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, c.size, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (frame < FRAMES) raf = requestAnimationFrame(draw);
    }

    start();
    const observer = new ResizeObserver(start);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ts-hero-fx" aria-hidden="true">
      <canvas ref={canvasRef} className="ts-hero-canvas" />
      {RUNNERS.map((r, i) => (
        <span
          key={i}
          className="ts-runner"
          style={{ top: r.top, animationDuration: `${r.run}ms` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.src}
            alt=""
            className={r.spin ? "ts-spin" : undefined}
            style={{
              animationDuration: r.spin ? `${r.spin}ms` : undefined,
              transform: r.flat ? "rotate(-90deg)" : undefined,
            }}
          />
        </span>
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={figD.src} alt="" className="ts-standing" />
    </div>
  );
}
