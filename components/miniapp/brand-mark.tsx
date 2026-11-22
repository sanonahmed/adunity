import { cn } from "@/lib/utils";

/**
 * Brand mark: a gold-tile "A" built from two strokes. Inline SVG so it stays
 * crisp at any density and needs no network round-trip.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[12px]",
        "bg-[linear-gradient(155deg,#f9f0da_0%,#e6d2a8_48%,#b8965e_100%)]",
        "shadow-[0_10px_24px_-12px_rgba(230,210,168,0.85),inset_0_1px_0_rgba(255,255,255,0.75)]",
        "ring-1 ring-white/25",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[19px] text-[#171208]"
      >
        <path d="M6.2 19.4 12 5.2l5.8 14.2" />
        <path d="M9.1 14.6h5.8" />
      </svg>
    </span>
  );
}

/** Full lockup used on the hero. */
export function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className="size-11 rounded-[14px]" />
      <div className="leading-tight">
        <p className="text-[19px] font-semibold tracking-[-0.03em]">
          Ad<span className="gold-text">Unity</span>
        </p>
        <p className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Telegram Mini App
        </p>
      </div>
    </div>
  );
}
