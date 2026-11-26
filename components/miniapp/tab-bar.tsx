"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { TABS, tabIndex, type TabId } from "./tabs";

type TabBarProps = {
  active: TabId;
  onChange: (next: TabId) => void;
  /** White-page variant used by the Auto Bot section. */
  light?: boolean;
};

/**
 * Bottom navigation. Equal-width tabs, gold indicator that slides via transform,
 * roving tabindex + arrow/Home/End keys per the WAI-ARIA tabs pattern.
 */
export function TabBar({ active, onChange, light = false }: TabBarProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const index = tabIndex(active);

  function focusTab(next: number) {
    const bounded = (next + TABS.length) % TABS.length;
    const target = TABS[bounded];
    buttons.current[bounded]?.focus();
    onChange(target.id);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(TABS.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 pb-[var(--safe-bottom)]",
        /* Paints the home-indicator strip; the page behind it may be white. */
        light && "bg-white",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-10 h-16",
          light
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0),#fff)]"
            : "bg-[linear-gradient(180deg,transparent,rgba(6,7,11,0.92))]",
        )}
      />
      <div className="relative mx-auto w-full max-w-md px-4 pb-3">
        <div
          role="tablist"
          aria-label="Mini App sections"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className={cn(
            "relative flex items-stretch rounded-[22px] p-1.5",
            light
              ? "border border-[#e8eaed] bg-white shadow-[0_18px_44px_-30px_rgba(60,64,67,0.45)]"
              : "glass-strong",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "tab-indicator pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/5)] rounded-[16px]",
              light
                ? "border border-[#e6d2a8] bg-[linear-gradient(180deg,#faf5e9,#f1e6cb)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                : "border border-gold/20 bg-[linear-gradient(180deg,rgba(230,210,168,0.17),rgba(230,210,168,0.05))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
            )}
            style={{ transform: `translateX(${index * 100}%)` }}
          />

          {TABS.map((tab, i) => {
            const selected = tab.id === active;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                ref={(node) => {
                  buttons.current[i] = node;
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(tab.id)}
                className={cn(
                  "tap relative z-10 flex flex-1 flex-col items-center gap-1 rounded-[16px] px-1 py-2",
                  "text-[10.5px] font-semibold tracking-[0.02em]",
                  light
                    ? selected
                      ? "text-[#8a6a35]"
                      : "text-[#5f6368]"
                    : selected
                      ? "text-gold"
                      : "text-muted-foreground/85",
                )}
              >
                <Icon
                  className={
                    selected
                      ? "size-[19px] transition-transform duration-300"
                      : "size-[19px] transition-transform duration-300 opacity-80"
                  }
                  strokeWidth={selected ? 2.2 : 1.8}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
                <span className="sr-only">
                  {selected ? "(selected)" : ""} {tab.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
