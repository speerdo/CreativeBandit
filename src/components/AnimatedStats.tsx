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
    label: "Affiliate conversion rate, 4x the industry average",
    color: "#D9F24A",
  },
  {
    value: 100,
    suffix: "%",
    label: "AI verification accuracy with Gemini-powered validation",
    color: "#FF4D14",
  },
  {
    value: 40,
    suffix: "%",
    label: "Page load improvement on EdReports platform migration",
    color: "#EDE8DF",
  },
  {
    value: 90,
    suffix: "%",
    label: "Reduction in manual review time through automation",
    color: "#6E79FF",
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
      <div
        className="relative overflow-hidden border p-8 transition-all duration-300"
        style={{
          background: "#17171A",
          borderColor: isVisible ? `${stat.color}55` : "transparent",
        }}
      >
        {/* Accent line at top */}
        <div
          className="absolute left-0 top-0 h-[3px] transition-all duration-1000 ease-out"
          style={{
            width: isVisible ? "100%" : "0%",
            background: stat.color,
            transitionDelay: `${index * 150}ms`,
          }}
        />

        <div>
          <div
            className="mb-3 font-display text-5xl font-extrabold leading-none transition-colors duration-300 md:text-6xl"
            style={{ color: stat.color, fontStretch: "125%" }}
          >
            {displayValue}
            <span className="text-3xl md:text-4xl">{stat.suffix}</span>
          </div>
          <p className="font-mono text-[0.7rem] uppercase leading-relaxed tracking-[0.14em] text-paper-mute">{stat.label}</p>
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
