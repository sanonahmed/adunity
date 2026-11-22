import { Gift, House, Megaphone, UserRound, type LucideIcon } from "lucide-react";

export type TabId = "home" | "ads" | "referral" | "profile";

export type TabDefinition = {
  id: TabId;
  label: string;
  icon: LucideIcon;
  /** Short line used as the panel's accessible description. */
  hint: string;
};

export const TABS: readonly TabDefinition[] = [
  { id: "home", label: "Home", icon: House, hint: "Overview" },
  { id: "ads", label: "Ads", icon: Megaphone, hint: "Campaigns unavailable" },
  { id: "referral", label: "Referral", icon: Gift, hint: "Your invite link and referrals" },
  { id: "profile", label: "Profile", icon: UserRound, hint: "Account" },
] as const;

export const TAB_IDS = TABS.map((tab) => tab.id);

export function tabIndex(id: TabId): number {
  return TABS.findIndex((tab) => tab.id === id);
}

export function isTabId(value: string): value is TabId {
  return TAB_IDS.includes(value as TabId);
}
