"use client";

import { useState } from "react";
import { Check, Copy, Gift, LoaderCircle, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatReferralCode } from "@/lib/referral";
import { shareLink } from "@/lib/telegram";
import type { ReferralState } from "../use-referral";

type ReferralPanelProps = {
  active: boolean;
  /** Signed launch payload; empty in a plain browser. */
  initData: string;
  referral: ReferralState;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

/**
 * Referral tab. Renders only data the server derived from a verified Telegram
 * launch: nothing here is sample data, and no earnings are implied.
 */
export function ReferralPanel({ active, initData, referral }: ReferralPanelProps) {
  const { summary, inviteLink, loading, error, retry } = referral;
  const [copied, setCopied] = useState(false);

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard is blocked in some WebViews; sharing still works. */
      window.prompt("Copy your invite link:", inviteLink);
    }
  }

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
          <Badge variant={summary ? "success" : "muted"}>
            {loading ? "Loading" : summary ? "Connected" : "Referral program"}
          </Badge>
        </div>

        <p className="eyebrow mt-8">Referral program</p>
        <h1 className="mt-2 max-w-[16ch] text-[29px] font-semibold leading-[1.08] tracking-[-0.04em]">
          {summary ? "Invite your people." : "Your invitations, together."}
        </h1>
        <p className="mt-3 max-w-[36ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {summary
            ? "Share your personal Telegram link and see verified sign-ups attributed to you."
            : "Your personal invite code and verified sign-ups are loaded securely from Telegram."}
        </p>

        {loading ? (
          <div className="mt-7 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading verified referral data…
          </div>
        ) : null}

        {!initData ? (
          <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <p className="text-[12.5px] font-semibold">Open AdUnity in Telegram</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Referral codes and sign-ups are tied to your verified Telegram
              account, so personal referral data is only available inside the
              Mini App.
            </p>
          </div>
        ) : null}

        {error ? (
          <div
            className="mt-5 rounded-2xl border border-rose-300/15 bg-rose-300/[0.04] p-4"
            role="alert"
          >
            <p className="text-[12px] leading-relaxed text-rose-100/85">{error}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : null}

        {summary ? (
          <>
            <div className="mt-7 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
                  Verified invites
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {summary.invitedCount}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
                  Your code
                </p>
                <p className="mt-2 font-mono text-[17px] font-semibold tracking-[0.08em]">
                  {formatReferralCode(summary.code)}
                </p>
              </div>
            </div>

            {inviteLink ? (
              <>
                <p className="mt-4 break-all rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-foreground/65">
                  {inviteLink}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button onClick={() => shareLink(inviteLink, "Join me on AdUnity")}>
                    <Share2 className="size-4" aria-hidden="true" />
                    Share invite
                  </Button>
                  <Button variant="outline" onClick={copyInviteLink}>
                    {copied ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
                <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
                  This link opens AdUnity from the bot&apos;s menu button. If Telegram
                  answers &quot;bot application not found&quot;, point the bot&apos;s menu
                  button at this Mini App in @BotFather with /setmenubutton.
                </p>
              </>
            ) : (
              <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
                Invite links are not configured yet. The app owner must set
                NEXT_PUBLIC_TELEGRAM_BOT_USERNAME for this deployment.
              </p>
            )}
          </>
        ) : null}
      </div>

      {summary ? (
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] font-semibold">Recent verified sign-ups</p>
            <span className="text-[10.5px] text-muted-foreground">
              Joined {formatDate(summary.joinedAt)}
            </span>
          </div>
          {summary.recent.length > 0 ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {summary.recent.map((record) => (
                <li
                  key={`${record.joinedAt}-${record.name}`}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="truncate text-[12px] font-medium">{record.name}</span>
                  <time
                    className="shrink-0 text-[10.5px] text-muted-foreground"
                    dateTime={record.joinedAt}
                  >
                    {formatDate(record.joinedAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              No verified sign-ups yet. When someone new opens AdUnity through your
              link, their verified sign-up date will appear here.
            </p>
          )}
          <p className="mt-4 border-t border-white/[0.06] pt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            Invite counts track verified Telegram sign-ups only. Referral rewards
            and payouts are not configured.
          </p>
        </div>
      ) : null}
    </section>
  );
}
