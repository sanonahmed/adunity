"use client";

import { Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ReferralPanelProps = {
  active: boolean;
};

/**
 * No referral records are available yet: referral persistence and attribution
 * are not implemented. Keep this state explicit instead of presenting sample
 * counts, an unassigned invite code, or estimated earnings as real data.
 */
export function ReferralPanel({ active }: ReferralPanelProps) {
  return (
    <section
      id="panel-referral"
      role="tabpanel"
      aria-labelledby="tab-referral"
      tabIndex={0}
      hidden={!active}
      className="panel-enter space-y-3 pt-14 outline-none"
    >
      <div className="rise glass rounded-3xl p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 place-items-center rounded-2xl border border-gold/20 bg-gold-soft text-gold">
            <Gift className="size-[19px]" aria-hidden="true" />
          </span>
          <Badge variant="muted">Unavailable</Badge>
        </div>

        <p className="eyebrow mt-8">Referral program</p>
        <h1 className="mt-2 max-w-[16ch] text-[29px] font-semibold leading-[1.08] tracking-[-0.04em]">
          Referral data unavailable.
        </h1>
        <p className="mt-3 max-w-[36ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Referral tracking is not connected yet, so there are no verified
          referral records to show.
        </p>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="text-[12.5px] font-semibold">No referral figures shown</p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          A server-issued invite link, confirmed sign-ups and recorded earnings
          will appear here after referral storage and attribution are available.
        </p>
      </div>
    </section>
  );
}
