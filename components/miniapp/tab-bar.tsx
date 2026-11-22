"use client";

import { useRef } from "react";
import { TABS, tabIndex, type TabId } from "./tabs";

type TabBarProps = {
  active: TabId;
  onChange: (next: TabId) => void;
};

/**
 * Bottom navigation. Four equal tabs, gold indicator that slides via transform,
 * roving tabindex + arrow/Home/End keys per the WAI-ARIA tabs pattern.
 */
export function TabBar({ active, onChange }: TabBarProps) {
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
      className="fixed inset-x-0 bottom-0 z-40 pb-[var(--safe-bottom)]"
    >
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-16 bg-[linear-gradient(180deg,transparent,rgba(6,7,11,0.92))]" />
      <div className="relative mx-auto w-full max-w-md px-4 pb-3">
        <div
          role="tablist"
          aria-label="Mini App sections"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="glass-strong relative flex items-stretch rounded-[22px] p-1.5"
        >
          <span
            aria-hidden="true"
            className="tab-indicator pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/4)] rounded-[16px] border border-gold/20 bg-[linear-gradient(180deg,rgba(230,210,168,0.17),rgba(230,210,168,0.05))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
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
                className={[
                  "tap relative z-10 flex flex-1 flex-col items-center gap-1 rounded-[16px] px-1 py-2",
                  "text-[10.5px] font-semibold tracking-[0.02em]",
                  selected ? "text-gold" : "text-muted-foreground/85",
                ].join(" ")}
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
