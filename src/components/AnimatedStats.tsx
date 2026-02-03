import { useEffect, useRef, useState } from "react";

interface Stat {
  value: number;
  suffix: string;
  label: string;
  color: string;
}

const stats: Stat[] = [
  {
    value: 8.08,
    suffix: "%",
    label: "Affiliate conversion rate — 4x the industry average",
    color: "#ffd700",
  },
  {
    value: 100,
    suffix: "%",
    label: "AI verification accuracy with Gemini-powered validation",
    color: "#ff6a00",
  },
  {
    value: 40,
    suffix: "%",
    label: "Page load improvement on EdReports platform migration",
    color: "#ff1c1c",
  },
  {
    value: 90,
    suffix: "%",
    label: "Reduction in manual review time through automation",
    color: "#a100ff",
  },
];

function useCountUp(
  end: number,
  duration: number,
  trigger: boolean
): string {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!trigger) return;

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = eased * end;
      setCurrent(value);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setCurrent(end);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [end, duration, trigger]);

  const isDecimal = end % 1 !== 0;
  return isDecimal ? current.toFixed(2) : Math.round(current).toString();
}

function StatCard({ stat, index, isVisible }: { stat: Stat; index: number; isVisible: boolean }) {
  const displayValue = useCountUp(stat.value, 2000 + index * 200, isVisible);

  return (
    <div className="relative group">
      {/* Glow background */}
      <div
        className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
        style={{ background: stat.color, opacity: isVisible ? undefined : 0 }}
      />
      <div
        className="relative rounded-2xl p-8 border transition-all duration-500 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(26,26,26,0.9), rgba(13,13,13,0.95))",
          borderColor: isVisible ? `${stat.color}33` : "transparent",
        }}
      >
        {/* Accent line at top */}
        <div
          className="absolute top-0 left-0 h-1 transition-all duration-1000 ease-out"
          style={{
            width: isVisible ? "100%" : "0%",
            background: `linear-gradient(90deg, ${stat.color}, transparent)`,
            transitionDelay: `${index * 150}ms`,
          }}
        />

        <div className="text-center">
          <div
            className="text-5xl md:text-6xl font-bold font-heading mb-3 transition-colors duration-300"
            style={{ color: stat.color }}
          >
            {displayValue}
            <span className="text-3xl md:text-4xl">{stat.suffix}</span>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed">{stat.label}</p>
        </div>
      </div>
    </div>
  );
}

export default function AnimatedStats() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, i) => (
        <StatCard key={i} stat={stat} index={i} isVisible={isVisible} />
      ))}
    </div>
  );
}
