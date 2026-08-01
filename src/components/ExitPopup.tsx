import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "cb_popup_dismissed";
const SCROLL_THRESHOLD = 0.5;

export default function ExitPopup() {
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    } catch {}
  }, []);

  useEffect(() => {
    // Don't show if already dismissed in the last 7 days
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed) {
        const elapsed = Date.now() - Number(dismissed);
        if (elapsed < 7 * 24 * 60 * 60 * 1000) return;
      }
    } catch {}

    let shown = false;

    const showPopup = () => {
      if (shown) return;
      shown = true;
      setVisible(true);
    };

    // Exit-intent: mouse leaves viewport top (desktop only)
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) showPopup();
    };

    // Scroll trigger: show after scrolling 50% of page
    const handleScroll = () => {
      const scrolled =
        window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrolled >= SCROLL_THRESHOLD) showPopup();
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={dismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg border border-[#E8451F]/40 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #17171A 0%, #0B0B0C 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 z-10 text-[#B5AEA3] transition-colors hover:text-[#FFE800]"
          aria-label="Close popup"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Accent bar */}
        <div
          className="h-1 w-full"
          style={{
            background: "linear-gradient(90deg, #FFE800 0%, #FFE800 25%, #E8451F 25%, #E8451F 50%, #E5195A 50%, #E5195A 75%, #1B27E8 75%)",
          }}
        />

        <div className="p-8">
          {!submitted ? (
            <>
              <img
                src="/mascot/bandit-cat-head.svg"
                alt=""
                width="77"
                height="64"
                className="mb-4 h-16 w-auto"
              />
              <h3 className="mb-2 font-display text-2xl font-extrabold uppercase leading-none" style={{ fontStretch: "125%" }}>
                Before you go, grab your free checklist
              </h3>
              <p className="mb-6 text-sm leading-relaxed text-[#B5AEA3]">
                Get our <strong className="text-[#EDE8DF]">AI Automation Readiness Checklist</strong>,
                15 questions to evaluate where AI can save your business the most time and money.
              </p>

              {/* Replace action URL with your Kit form action */}
              <form
                action="YOUR_KIT_FORM_URL"
                method="POST"
                onSubmit={() => setSubmitted(true)}
                className="space-y-4"
              >
                <input
                  type="email"
                  name="email_address"
                  placeholder="Enter your email"
                  required
                  className="w-full px-4 py-3 border border-[#B5AEA3]/40 text-[#EDE8DF] placeholder:text-[#B5AEA3]/50 focus:outline-none focus:ring-2 focus:ring-[#FFE800]"
                  style={{ background: "#0B0B0C" }}
                />
                <input type="hidden" name="tags" value="lead-magnet-checklist" />
                <button
                  type="submit"
                  className="w-full py-3 font-mono text-sm font-bold uppercase tracking-[0.12em] text-[#0B0B0C] transition-all hover:brightness-110"
                  style={{
                    background: "#E8451F",
                  }}
                >
                  Send the Free Checklist
                </button>
              </form>

              <p className="mt-3 text-center font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[#B5AEA3]/70">
                No spam. Unsubscribe anytime.
              </p>
            </>
          ) : (
            <div className="text-center py-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(16, 185, 129, 0.15)" }}
              >
                <svg className="w-8 h-8" style={{ color: "#10b981" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Check your inbox!</h3>
              <p className="text-sm text-[#B5AEA3]">
                Your AI Automation Readiness Checklist is on its way.
              </p>
              <button
                onClick={dismiss}
                className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-[#B5AEA3] underline transition-colors hover:text-[#FFE800]"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
