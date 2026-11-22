"use client";

import { useState } from "react";
import {
  CalendarDays, Check, Coins, Copy, Flame, Gift, LoaderCircle, Medal,
  RefreshCw, Share2, Target, TrendingUp, Trophy, UserCheck, Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatReferralCode, REFERRAL_MILESTONES, REFERRAL_POINT_VALUE_USD,
  type ReferralActivityDay, type ReferralRewards,
} from "@/lib/referral";
import { shareLink } from "@/lib/telegram";
import type { ReferralState } from "../use-referral";

type ReferralPanelProps = {
  active: boolean;
  /** Signed launch payload; empty in a plain browser. */
  initData: string;
  referral: ReferralState;
};

const countFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const usdFormat = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

function formatCount(value: number): string {
  return countFormat.format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

/** Format UTC activity calendar dates in UTC. */
function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", timeZone: "UTC",
  }).format(date);
}

function formatRelative(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Recently";
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d ago` : formatDate(value);
}

function trendLabel(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return previous === 0 ? "No new invites" : "Same as last week";
  return `${delta > 0 ? "+" : ""}${formatCount(delta)} vs last week`;
}

function Tile({ icon: Icon, label, value, hint }: {
  icon: LucideIcon; label: string; value: string; hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
        <Icon className="size-3.5 shrink-0 text-gold/70" aria-hidden="true" />
      </div>
      <p className="mt-2.5 text-[22px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
      <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Zero-filled bar chart for the activity window; no chart library needed. */
function ActivityChart({ days }: { days: ReferralActivityDay[] }) {
  const peak = days.reduce((max, day) => Math.max(max, day.count), 1);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  return (
    <div className="mt-4" role="img" aria-label={`${total} verified ${total === 1 ? "invite" : "invites"} in the last ${days.length} days`}>
      <div className="flex h-16 items-end gap-1">
        {days.map((day) => {
          const height = day.count > 0 ? Math.max(14, Math.round((day.count / peak) * 100)) : 0;
          return (
            <div key={day.date} className="flex h-full flex-1 items-end" title={`${formatDay(day.date)} · ${day.count}`}>
              {day.count > 0
                ? <div className="w-full rounded-t-[3px] bg-[linear-gradient(180deg,#f4e6c6,#bf9f6b)]" style={{ height: `${height}%` }} />
                : <div className="w-full rounded-t-[3px] bg-white/[0.09]" style={{ height: "3px" }} />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        <span>{days.length > 0 ? formatDay(days[0].date) : ""}</span><span>Today</span>
      </div>
    </div>
  );
}


/** Points balance, milestone progress and the reward tier ladder. */
function RewardsCard({ rewards, invitedCount }: { rewards: ReferralRewards; invitedCount: number }) {
  const next = rewards.nextMilestone;
  return (
    <div className="glass rise-late rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Earnings</p>
          <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.035em]">
            {rewards.estimatedUsd !== null ? usdFormat.format(rewards.estimatedUsd) : `${formatCount(rewards.points)} pts`}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {formatCount(rewards.points)} points · {formatCount(rewards.pointsPerInvite)} per invite
            {rewards.bonusPoints > 0 ? ` · +${formatCount(rewards.bonusPoints)} bonus` : ""}
          </p>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
            Points are earned from verified invites. They have no cash value.
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-gold/20 bg-gold-soft text-gold">
          <Coins className="size-[18px]" aria-hidden="true" />
        </span>
      </div>

      {next ? (
        <>
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <p className="text-[11.5px] font-medium text-foreground/80">
              {next.remaining} more {next.remaining === 1 ? "invite" : "invites"} to unlock +{formatCount(next.bonus)}
            </p>
            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{formatCount(invitedCount)}/{formatCount(next.target)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-label="Progress to the next reward milestone" aria-valuemin={0} aria-valuemax={next.target} aria-valuenow={invitedCount}>
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#bf9f6b,#f4e6c6)] transition-[width] duration-700" style={{ width: `${Math.max(2, Math.round(rewards.progress * 100))}%` }} />
          </div>
        </>
      ) : (
        <p className="mt-5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-gold">
          <Trophy className="size-3.5" aria-hidden="true" />Every milestone unlocked
        </p>
      )}

      <ol className="mt-5 grid grid-cols-5 gap-1.5">
        {REFERRAL_MILESTONES.map((milestone) => {
          const reached = invitedCount >= milestone.target;
          return (
            <li key={milestone.target} className={`rounded-xl border px-1 py-2 text-center ${reached ? "border-gold/25 bg-gold-soft text-gold" : "border-white/8 bg-white/[0.02] text-muted-foreground"}`} title={`${milestone.target} invites${reached ? " reached" : ""} · +${formatCount(milestone.bonus)} points`}>
              <span className="block text-[11px] font-semibold leading-none">{formatCount(milestone.target)}</span>
              <span className="mt-1 block text-[9px] leading-none">{reached ? "unlocked" : `+${formatCount(milestone.bonus)}`}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-muted-foreground">
        {REFERRAL_POINT_VALUE_USD > 0
          ? `Estimated at ${usdFormat.format(REFERRAL_POINT_VALUE_USD)} per point, based on verified invites.`
          : "Points are earned from verified invites and have no cash value."}
      </p>
    </div>
  );
}

/** Referral dashboard; only server-verified numbers are ever rendered. */
export function ReferralPanel({ active, initData, referral }: ReferralPanelProps) {
  const { summary, inviteLink, loading, error, retry } = referral;
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  async function copy(value: string, label: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* Clipboard is blocked in some WebViews; a prompt still lets the user copy. */
      window.prompt(label, value);
      return false;
    }
  }

  async function copyInviteLink() {
    if (!inviteLink || !(await copy(inviteLink, "Copy your invite link:"))) return;
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  }

  async function copyCode() {
    if (!summary || !(await copy(summary.code, "Copy your invite code:"))) return;
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  }

  return (
    <section id="panel-referral" role="tabpanel" aria-labelledby="tab-referral" tabIndex={0} hidden={!active} className="panel-enter space-y-3 pt-14 outline-none">
      <div className="rise glass rounded-3xl p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 place-items-center rounded-2xl border border-gold/20 bg-gold-soft text-gold">
            <Gift className="size-[19px]" aria-hidden="true" />
          </span>
          <Badge variant={summary ? "success" : "muted"}>
            {summary ? <span className="live-dot size-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> : null}
            {loading ? "Syncing" : summary ? "Active" : "Referral program"}
          </Badge>
        </div>

        <p className="eyebrow mt-8">Referral program</p>
        <h1 className="mt-2 max-w-[15ch] text-[29px] font-semibold leading-[1.08] tracking-[-0.04em]">Grow your circle.</h1>
        <p className="mt-3 max-w-[34ch] text-[13.5px] leading-relaxed text-muted-foreground">Share one link and every verified Telegram sign-up it brings lands here.</p>

        {loading ? (
          <div className="mt-7 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading your referral data…
          </div>
        ) : null}

        {!initData ? (
          <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <p className="text-[12.5px] font-semibold">Open AdUnity in Telegram</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">Your invite link, rewards and activity appear once AdUnity opens inside Telegram, so the numbers stay tied to a verified account.</p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-300/15 bg-rose-300/[0.04] p-4" role="alert">
            <p className="text-[12px] leading-relaxed text-rose-100/85">{error}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={retry}>Try again</Button>
          </div>
        ) : null}

        {summary ? (
          <>
            <div className="mt-7 flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your code</p>
                <p className="mt-1 font-mono text-[19px] font-semibold tracking-[0.12em]">{formatReferralCode(summary.code)}</p>
              </div>
              <button type="button" onClick={copyCode} aria-label="Copy invite code" className="tap grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-foreground/70 hover:border-gold/25 hover:text-gold">
                {copiedCode ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
            </div>

            {inviteLink ? (
              <>
                <p className="mt-3 break-all rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-foreground/65">{inviteLink}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button onClick={() => shareLink(inviteLink, "Join me on AdUnity")}>
                    <Share2 className="size-4" aria-hidden="true" />Share invite
                  </Button>
                  <Button variant="outline" onClick={copyInviteLink}>
                    {copiedLink ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                    {copiedLink ? "Copied" : "Copy link"}
                  </Button>
                </div>
                <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">Each person counts once, after their first verified launch through your link.</p>
              </>
            ) : (
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">Your invite link is temporarily unavailable.</p>
            )}
          </>
        ) : null}
      </div>

      {summary ? (
        <>
          <div className="glass rise rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Overview</p>
                <p className="mt-1.5 text-[13px] font-medium text-foreground/70">All-time performance</p>
              </div>
              <button type="button" onClick={retry} disabled={loading} aria-label="Refresh referral stats" className="tap grid size-8 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-gold/25 hover:text-gold disabled:opacity-40">
                <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Tile
                icon={Users}
                label="Verified invites"
                value={formatCount(summary.invitedCount)}
                hint={
                  summary.stats.today > 0
                    ? `${formatCount(summary.stats.today)} today`
                    : `${formatCount(summary.stats.last7Days)} in the last 7 days`
                }
              />
              <Tile
                icon={TrendingUp}
                label="This week"
                value={formatCount(summary.stats.last7Days)}
                hint={trendLabel(summary.stats.last7Days, summary.stats.previous7Days)}
              />
              <Tile
                icon={CalendarDays}
                label="Last 30 days"
                value={formatCount(summary.stats.last30Days)}
                hint={`${formatCount(summary.stats.activeDays)} active ${summary.stats.activeDays === 1 ? "day" : "days"}`}
              />
              <Tile
                icon={Trophy}
                label="Rank"
                value={summary.stats.rank ? `#${formatCount(summary.stats.rank)}` : "—"}
                hint={
                  summary.stats.referrers > 1
                    ? `of ${formatCount(summary.stats.referrers)} referrers`
                    : "Invite to enter the board"
                }
              />
            </div>

            <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] text-muted-foreground">
              Member since {formatDate(summary.joinedAt)}
            </p>
          </div>

          <RewardsCard rewards={summary.rewards} invitedCount={summary.invitedCount} />

          <div className="glass rise-late rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Activity</p>
                <p className="mt-1.5 text-[13px] font-medium text-foreground/70">Last {summary.stats.days.length} days</p>
              </div>
              {summary.stats.streakDays > 1 ? (
                <Badge variant="gold">
                  <Flame className="size-3" aria-hidden="true" />
                  {formatCount(summary.stats.streakDays)}-day streak
                </Badge>
              ) : null}
            </div>

            <ActivityChart days={summary.stats.days} />

            <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
              {[
                { label: "Today", value: summary.stats.today },
                { label: "7 days", value: summary.stats.last7Days },
                { label: "30 days", value: summary.stats.last30Days },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-[16px] font-semibold leading-none">{formatCount(item.value)}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Medal className="size-3 shrink-0 text-gold/80" aria-hidden="true" />
                Best day {summary.stats.bestDay ? `${formatDay(summary.stats.bestDay.date)} · ${formatCount(summary.stats.bestDay.count)}` : "—"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Target className="size-3 shrink-0 text-gold/80" aria-hidden="true" />
                Last invite {summary.stats.lastInviteAt ? formatRelative(summary.stats.lastInviteAt) : "—"}
              </span>
            </div>
          </div>

          <div className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Referred users</p>
                <p className="mt-1.5 text-[13px] font-medium text-foreground/70">
                  {formatCount(summary.invitedCount)} verified
                </p>
              </div>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground">
                <Users className="size-4" aria-hidden="true" />
              </span>
            </div>

            {summary.recent.length > 0 ? (
              <ul className="mt-3 divide-y divide-white/[0.06]">
                {summary.recent.map((record) => (
                  <li key={`${record.index}-${record.joinedAt}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300">
                      <UserCheck className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium">Invite #{formatCount(record.index)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        <time dateTime={record.joinedAt}>{formatRelative(record.joinedAt)}</time>
                      </p>
                    </div>
                    <Badge variant="success">Verified</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-white/10 p-4 text-center">
                <p className="text-[12px] font-medium">No invites yet</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  Share your link above — your first verified join shows up here.
                </p>
              </div>
            )}

            {summary.invitedCount > summary.recent.length ? (
              <p className="mt-3 text-center text-[10px] text-muted-foreground">
                Showing the {formatCount(summary.recent.length)} most recent of {formatCount(summary.invitedCount)}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
