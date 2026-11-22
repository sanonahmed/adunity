import { BrandMark } from "./brand-mark";

export function TopBar() {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-5 pb-2 pt-[calc(var(--safe-top)+0.9rem)]">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="leading-none">
            <p className="text-[15px] font-semibold tracking-[-0.02em]">
              AdUnity
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
              Mini App
            </p>
          </div>
        </div>

        <div
          className="glass rounded-full px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground/70"
          aria-label="Available on web and Telegram"
        >
          Web + Telegram
        </div>
      </div>
      <div className="mx-auto w-full max-w-md px-5">
        <div className="hairline" />
      </div>
    </header>
  );
}
