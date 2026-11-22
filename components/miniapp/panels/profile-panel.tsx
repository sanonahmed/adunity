"use client";

import {
  CalendarDays, CircleDollarSign, Clock3, Coins, History, LockKeyhole,
  UserRound, WalletCards, type LucideIcon,
} from "lucide-react";
import type { ReferralSummary } from "@/lib/referral";
import type { TelegramUser } from "@/lib/telegram";

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

type ProfilePanelProps = {
  active: boolean;
  user: TelegramUser | null;
  referral: ReferralSummary | null;
  loading: boolean;
};

function points(value: number): string {
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

/** Telegram identity and a transparent, points-only rewards overview. */
export function ProfilePanel({ active, user, referral, loading }: ProfilePanelProps) {
  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "Telegram profile";
  const todayPoints = referral ? referral.stats.today * referral.rewards.pointsPerInvite : null;

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
          <div><p className="eyebrow">Reward points</p><h2 className="mt-1.5 text-[16px] font-semibold tracking-[-0.02em]">Your earning overview</h2></div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/15 bg-gold-soft text-gold"><Coins className="size-4" aria-hidden="true" /></span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <StatCard icon={CalendarDays} label="Today" value={todayPoints === null ? "—" : `${points(todayPoints)} pts`} detail={referral ? `${points(referral.stats.today)} verified ${referral.stats.today === 1 ? "invite" : "invites"}` : "Verified invites today"} />

          <StatCard icon={CircleDollarSign} label="Total earned" value={referral ? `${points(referral.rewards.points)} pts` : loading ? "…" : "—"} detail="Invite points + milestone bonuses" featured />
          <StatCard icon={UserRound} label="Referred earnings" value={referral ? `${points(referral.rewards.invitePoints)} pts` : loading ? "…" : "—"} detail={referral ? `${points(referral.invitedCount)} verified referred ${referral.invitedCount === 1 ? "user" : "users"}` : "From verified referrals"} />
          <StatCard icon={WalletCards} label="Milestone bonuses" value={referral ? `${points(referral.rewards.bonusPoints)} pts` : loading ? "…" : "—"} detail="Bonus points from invite milestones" />
        </div>
        <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
          Points are AdUnity referral rewards, not cash. They currently have no cash value and cannot be withdrawn.
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
              AdUnity doesn’t currently have a cash balance or payout service. Referral points aren’t redeemable for money.
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
