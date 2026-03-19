"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ParticlesProps {
  className?: string;
  quantity?: number;
  staticity?: number;
  ease?: number;
  size?: number;
  color?: string;
  vx?: number;
  vy?: number;
}

function hexToRgb(hex: string): number[] {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
}

export default function Particles({
  className,
  quantity = 50,
  staticity = 50,
  ease = 50,
  size = 0.4,
  color = "#1C1A14",
  vx = 0,
  vy = 0,
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const mouse = useRef({ x: 0, y: 0 });
  const circles = useRef<any[]>([]);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const rgb = hexToRgb(color);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    if (!dimensions.width || !dimensions.height) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const createCircle = () => ({
      x: Math.random() * dimensions.width,
      y: Math.random() * dimensions.height,
      translateX: 0,
      translateY: 0,
      size: Math.random() * 2 + size,
      alpha: 0,
      targetAlpha: parseFloat((Math.random() * 0.6 + 0.1).toFixed(1)),
      dx: (Math.random() - 0.5) * 0.2,
      dy: (Math.random() - 0.5) * 0.2,
      magnetism: 0.1 + Math.random() * 4,
    });

    circles.current = Array.from({ length: quantity }, createCircle);

    const drawCircle = (circle: any) => {
      ctx.beginPath();
      ctx.arc(circle.x + circle.translateX, circle.y + circle.translateY, circle.size, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(${rgb.join(",")},${circle.alpha})`;
      ctx.fill();
    };

    let animFrame: number;
    const animate = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      circles.current.forEach((circle) => {
        if (circle.alpha < circle.targetAlpha) circle.alpha = Math.min(circle.alpha + 0.01, circle.targetAlpha);
        else circle.alpha = Math.max(circle.alpha - 0.01, 0);
        if (circle.alpha <= 0) {
          Object.assign(circle, createCircle(), { x: Math.random() * dimensions.width, y: Math.random() * dimensions.height });
        }
        circle.x += circle.dx + vx;
        circle.y += circle.dy + vy;
        circle.translateX += ((mouse.current.x / (staticity / circle.magnetism)) - circle.translateX) / ease;
        circle.translateY += ((mouse.current.y / (staticity / circle.magnetism)) - circle.translateY) / ease;
        drawCircle(circle);
      });
      animFrame = requestAnimationFrame(animate);
    };
    animate();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left - dimensions.width / 2, y: e.clientY - rect.top - dimensions.height / 2 };
    };
    canvas.addEventListener("mousemove", handleMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animFrame);
    };
  }, [dimensions, quantity, staticity, ease, size, vx, vy, dpr, rgb]);

  return (
    <div ref={containerRef} className={cn("pointer-events-none absolute inset-0", className)}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
