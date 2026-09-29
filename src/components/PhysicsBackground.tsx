import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface PhysicsBackgroundProps {
  className?: string;
  /** حد أقصى لعدد الجسيمات — الافتراضي 38 عشان يفضل خفيف */
  maxParticles?: number;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return null;
}

function readThemeRgb(el: HTMLElement): [number, number, number] {
  try {
    const raw =
      getComputedStyle(el).getPropertyValue('--color-primary-strong').trim() ||
      getComputedStyle(el).getPropertyValue('--color-primary').trim();
    const rgb = hexToRgb(raw);
    if (rgb) return rgb;
  } catch {
    /* ignore — fallback below */
  }
  return [147, 184, 132];
}

/**
 * خلفية فيزيائية حيّة وخفيفة — Canvas 2D بدون مكتبات.
 * - ~20-38 جسيم عائم بفيزياء (سرعة + ارتداد + تنافر مع الماوس)
 * - خطوط وصل خفيفة بين الجسيمات القريبة
 * - يتوقف تلقائياً خارج الشاشة / عند إخفاء التبويب / مع تقليل الحركة
 * - DPR محدود بـ 1.5 + بدون shadows/gradients عشان يفضل خفيف على الموبايل
 */
export function PhysicsBackground({ className = '', maxParticles = 38 }: PhysicsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    let particles: Particle[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let visible = true;
    let rgb = readThemeRgb(canvas);
    const mouse = { x: -9999, y: -9999 };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const seed = () => {
      const area = w * h;
      const count = Math.max(16, Math.min(maxParticles, Math.floor(area / 26000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.8,
      }));
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rgb = readThemeRgb(canvas);
      seed();
      if (reduced) drawStatic();
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let last = performance.now();
    const LINK_DIST = 110;

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(3, Math.max(0.5, (now - last) / 16.7));
      last = now;

      ctx.clearRect(0, 0, w, h);

      // وصلات خفيفة O(n²) لكن n ≤ 38 فالتكلفة مهملة
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.16;
            ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.55)`;
      for (const p of particles) {
        // تنافر خفيف مع المؤشر — إحساس فيزيائي حي
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < 130 * 130 && md2 > 1) {
          const dist = Math.sqrt(md2);
          const force = ((130 - dist) / 130) * 0.55 * dt;
          p.vx += (mdx / dist) * force;
          p.vy += (mdy / dist) * force;
        }
        // احتكاك خفيف يمنع التسارع الزائد
        p.vx *= 0.995;
        p.vy *= 0.995;
        // حد أقصى للسرعة
        const sp2 = p.vx * p.vx + p.vy * p.vy;
        if (sp2 > 1.2) {
          const s = Math.sqrt(sp2);
          p.vx = (p.vx / s) * 1.1;
          p.vy = (p.vy / s) * 1.1;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // ارتداد من الحواف
        if (p.x < 0) {
          p.x = 0;
          p.vx *= -1;
        } else if (p.x > w) {
          p.x = w;
          p.vx *= -1;
        }
        if (p.y < 0) {
          p.y = 0;
          p.vy *= -1;
        } else if (p.y > h) {
          p.y = h;
          p.vy *= -1;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onPointerLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    const onVisibility = () => {
      last = performance.now();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        last = performance.now();
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    // تتبع تغيير الثيم لالتقاط لون الـ primary الجديد
    const mo = new MutationObserver(() => {
      rgb = readThemeRgb(canvas);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    parent.addEventListener('pointermove', onPointerMove);
    parent.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    if (!reduced) {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      parent.removeEventListener('pointermove', onPointerMove);
      parent.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [maxParticles]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="physics-background"
      className={`pointer-events-none absolute inset-0 ${className}`}
    />
  );
}
