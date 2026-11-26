import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

type TopBarProps = {
  /** White-page variant used by the Auto Bot section. */
  light?: boolean;
};

export function TopBar({ light = false }: TopBarProps) {
  return (
    <header className={cn("relative z-20", light && "bg-white")}>
      <div className="mx-auto flex w-full max-w-md items-center px-5 pb-2 pt-[calc(var(--safe-top)+0.9rem)]">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="leading-none">
            <p
              className={cn(
                "text-[15px] font-semibold tracking-[-0.02em]",
                light && "text-[#202124]",
              )}
            >
              AdUnity
            </p>
            <p
              className={cn(
                "mt-1 text-[10px] font-medium uppercase tracking-[0.18em]",
                light ? "text-[#5f6368]" : "text-muted-foreground/80",
              )}
            >
              Mini App
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md px-5">
        {/* `.hairline` fades out at both ends, so on white it would be invisible. */}
        {light ? <div className="h-px bg-[#e8eaed]" /> : <div className="hairline" />}
      </div>
    </header>
  );
}
