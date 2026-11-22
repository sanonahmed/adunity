"use client";

import {
  CalendarDays, CircleDollarSign, Clock3, Coins, History, LockKeyhole,
  UserRound, WalletCards, type LucideIcon,
} from "lucide-react";
import { REFERRAL_COMMISSION_PERCENT, type ReferralSummary } from "@/lib/referral";
import type { TelegramUser } from "@/lib/telegram";

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const bdtFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ProfilePanelProps = {
  active: boolean;
  user: TelegramUser | null;
  referral: ReferralSummary | null;
  loading: boolean;
};

function count(value: number): string {
  return numberFormat.format(value);
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  featured = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  featured?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${featured ? "border-gold/20 bg-gold/[0.07]" : "border-white/[0.07] bg-white/[0.025]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
        <Icon className="size-3.5 shrink-0 text-gold/75" aria-hidden="true" />
      </div>
      <p className="mt-3 text-[25px] font-semibold leading-none tracking-[-0.035em]">{value}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

/** Telegram identity and a BDT referral earnings overview. */
export function ProfilePanel({ active, user, referral, loading }: ProfilePanelProps) {
  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "Telegram profile";
  const earnings = referral?.rewards.earnedBdt ?? null;

  return (
    <section id="panel-profile" role="tabpanel" aria-labelledby="tab-profile" tabIndex={0} hidden={!active} className="panel-enter space-y-3 pt-9 outline-none">
      <div className="glass rise overflow-hidden rounded-3xl">
        <div className="h-24 bg-[radial-gradient(ellipse_at_20%_0%,rgba(230,210,168,0.2),transparent_65%),linear-gradient(135deg,rgba(255,255,255,0.045),transparent)]" />
        <div className="px-5 pb-5">
          <div className="-mt-11 flex items-end justify-between gap-3">
            <div className="grid size-[82px] shrink-0 place-items-center overflow-hidden rounded-[26px] border-[3px] border-[#0b0e15] bg-[#151821] shadow-[0_12px_34px_-18px_rgba(230,210,168,0.6)]">
              {user?.photo_url ? (
                // Telegram supplies this profile URL; avoid remote-image config for the Mini App.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photo_url} alt={`${name}'s Telegram profile photo`} className="size-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserRound className="size-8 text-gold/70" aria-hidden="true" />
              )}
            </div>
            <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-200/80">
              <span className="size-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
              {user ? "Telegram account" : "Not connected"}
            </span>
          </div>
          <div className="mt-4 min-w-0">
            <p className="eyebrow">Your profile</p>
            <h1 className="mt-1.5 truncate text-[26px] font-semibold leading-tight tracking-[-0.04em]">{name}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {user?.username ? `@${user.username}` : user ? "No Telegram username" : "Open AdUnity in Telegram to load your account"}
            </p>
          </div>
          <div className="mt-5 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-[10.5px] text-muted-foreground">
            <LockKeyhole className="size-3.5 shrink-0 text-gold/70" aria-hidden="true" />
            <span>Your identity comes from your Telegram profile.</span>
          </div>
        </div>
      </div>

      <div className="glass rise rounded-3xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="eyebrow">Referral earnings</p><h2 className="mt-1.5 text-[16px] font-semibold tracking-[-0.02em]">Your BDT share</h2></div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/15 bg-gold-soft text-gold"><Coins className="size-4" aria-hidden="true" /></span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <StatCard icon={CircleDollarSign} label="Earned" value={earnings === null ? "BDT —" : `${bdtFormat.format(earnings)} BDT`} detail="From referred users’ ad revenue" featured />
          <StatCard icon={WalletCards} label="Commission" value={`${referral?.rewards.commissionPercent ?? 25}%`} detail="Share of referred ad revenue" />
          <StatCard icon={UserRound} label="Verified referrals" value={referral ? count(referral.invitedCount) : loading ? "…" : "—"} detail="Users attributed to your link" />
          <StatCard icon={CalendarDays} label="Invites today" value={referral ? count(referral.stats.today) : loading ? "…" : "—"} detail="Verified sign-ups today" />
        </div>
        <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
          No instant invite bonus: your {REFERRAL_COMMISSION_PERCENT}% share accrues only as referred users generate ad revenue. BDT earnings appear when revenue tracking is connected.
        </p>
      </div>

      <div className="glass rise-late rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-muted-foreground">
            <WalletCards className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Withdrawals</p>
            <h2 className="mt-1.5 text-[15px] font-semibold">Cash withdrawals aren’t available</h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Ad revenue tracking and cash payouts aren’t connected yet. Referral earnings are calculated in BDT when referred-user revenue is available.
            </p>
          </div>
        </div>
        <button type="button" disabled aria-describedby="withdrawal-unavailable-note" className="mt-4 inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] text-[13px] font-semibold text-muted-foreground/70">
          <CircleDollarSign className="size-4" aria-hidden="true" />Withdrawals unavailable
        </button>
        <p id="withdrawal-unavailable-note" className="mt-2 text-center text-[9.5px] text-muted-foreground/70">
          No withdrawal request can be submitted at this time.
        </p>
      </div>

      <div className="glass rise-late rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="eyebrow">Payout activity</p><h2 className="mt-1.5 text-[15px] font-semibold">Withdrawal history</h2></div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-muted-foreground"><History className="size-4" aria-hidden="true" /></span>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.09] px-4 py-5 text-center">
          <Clock3 className="mx-auto size-5 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-2 text-[12px] font-medium">No withdrawal history</p>
          <p className="mx-auto mt-1 max-w-[30ch] text-[10px] leading-relaxed text-muted-foreground">
            Withdrawals aren’t enabled, so there are no payout records to show.
          </p>
        </div>
      </div>
    </section>
  );
}
