/**
 * Typed subset of the Telegram Mini Apps SDK.
 *
 * We deliberately hand-type only the surface this app touches instead of
 * pulling a global `@types` package: nothing leaks into `Window` that we do
 * not actually support, and the guards below make every optional API safe on
 * older clients (Bot API 6.x and below).
 */

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  isExpanded: boolean;
  viewportHeight: number;

  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string) => void;
  BackButton?: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };

  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Matches --color-ink so the Telegram chrome blends into the canvas. */
export const INK = "#06070b";

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function isTelegramClient(): boolean {
  const app = getWebApp();
  /* `initData` is only non-empty when launched from a real Telegram client. */
  return Boolean(app && app.initData.length > 0);
}

/**
 * Compares dotted SDK versions ("7.7" >= "6.1"). Pure, so it is unit-testable
 * without a DOM. Outside Telegram the SDK reports itself as "6.0".
 */
export function versionAtLeast(current: string, required: string): boolean {
  const parse = (raw: string): [number, number] => {
    const [major, minor] = raw.split(".");
    return [Number.parseInt(major, 10) || 0, Number.parseInt(minor, 10) || 0];
  };

  const [curMajor, curMinor] = parse(current);
  const [reqMajor, reqMinor] = parse(required);

  return curMajor > reqMajor || (curMajor === reqMajor && curMinor >= reqMinor);
}

/** True when the connected client speaks at least `required`. */
export function supports(required: string): boolean {
  const app = getWebApp();
  return Boolean(app && versionAtLeast(app.version, required));
}

/** Chrome/haptics calls are cosmetic: a failure must never break the app. */
function attempt(fn: () => void): void {
  try {
    fn();
  } catch {
    /* Older clients throw on methods they do not implement. */
  }
}

/**
 * Boot the SDK once, idempotently.
 *
 * `ready()` and `expand()` exist since 6.0 and are safe everywhere. Everything
 * below them mutates Telegram's own chrome, so it runs only inside a real
 * client — the SDK warns on every unsupported call, and a browser reports
 * version 6.0, which would otherwise fill the console with noise.
 */
export function initTelegram(): TelegramWebApp | null {
  const app = getWebApp();
  if (!app) return null;

  attempt(() => app.ready());
  if (!app.isExpanded) attempt(() => app.expand());

  if (!isTelegramClient()) return app;

  /* Bot API 6.1 added header/background colours and haptics. */
  if (supports("6.1")) {
    attempt(() => app.setHeaderColor(INK));
    attempt(() => app.setBackgroundColor(INK));
  }

  /* Bot API 7.7 added swipe control. */
  if (app.disableVerticalSwipes && supports("7.7")) {
    attempt(() => app.disableVerticalSwipes?.());
  }

  return app;
}

/** Haptics only on 6.1+ clients that are actually inside Telegram. */
function haptics(): NonNullable<TelegramWebApp["HapticFeedback"]> | null {
  const app = getWebApp();
  if (!app || !app.HapticFeedback || !isTelegramClient()) return null;
  return supports("6.1") ? app.HapticFeedback : null;
}

export function hapticTap(): void {
  const feedback = haptics();
  if (!feedback) return;
  attempt(() => feedback.selectionChanged());
}

export function hapticResult(ok: boolean): void {
  const feedback = haptics();
  if (!feedback) return;
  attempt(() => feedback.notificationOccurred(ok ? "success" : "error"));
}

/** Telegram's native share sheet when available, a normal tab otherwise. */
export function shareLink(url: string, text: string): void {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const app = getWebApp();

  /* openTelegramLink landed in 6.1; older clients keep the web fallback. */
  if (app && isTelegramClient() && supports("6.1")) {
    attempt(() => app.openTelegramLink(shareUrl));
    return;
  }

  window.open(shareUrl, "_blank", "noopener,noreferrer");
}
