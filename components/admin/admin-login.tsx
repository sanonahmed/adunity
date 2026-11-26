"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LockKeyhole, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "./field-styles";

const ERROR_COPY: Record<string, string> = {
  invalid_password: "That password doesn't match. Try again.",
  too_many_attempts: "Too many attempts. Wait 10 minutes, then try again.",
  admin_not_configured: "Admin access isn't configured on this server.",
  bad_origin: "Request blocked. Open the admin panel from its own address and retry.",
  invalid_json: "The sign-in request was malformed. Reload and try again.",
};

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setError(ERROR_COPY[payload?.error ?? ""] ?? "Sign-in failed. Please try again.");
        setBusy(false);
        return;
      }

      setPassword("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="glass rise rounded-3xl p-6">
        <span className="grid size-10 place-items-center rounded-xl border border-gold/15 bg-gold-soft text-gold">
          <Store className="size-4.5" aria-hidden="true" />
        </span>

        <p className="eyebrow mt-5">AdUnity operations</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">Market admin</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          Manage the buyer request feed shown on Home. Sign-in uses a server-side password and
          an HttpOnly session cookie.
        </p>

        {configured ? (
          <form className="mt-6 space-y-3" onSubmit={signIn} noValidate>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Admin password
              </span>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
                  aria-hidden="true"
                />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your admin password"
                  className={`${FIELD_CLASS} pl-9`}
                  disabled={busy}
                  required
                />
              </div>
            </label>

            {error ? (
              <p role="alert" className="text-[11.5px] leading-relaxed text-red-300/90">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy || password.length === 0}>
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound aria-hidden="true" />
              )}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <Badge variant="gold">Setup required</Badge>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Set both variables below in <code className="text-foreground/85">.env.local</code>,
              then restart the dev server. The password must be at least 12 characters and the
              session secret at least 32.
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/40 p-3 text-[10.5px] leading-relaxed text-foreground/80">
              <code>{`ADMIN_PASSWORD=<long password>
ADMIN_SESSION_SECRET=<32+ random characters>`}</code>
            </pre>
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              Generate both with:
              <br />
              <code className="text-foreground/80">
                node -e &quot;const c=require(&apos;node:crypto&apos;);console.log(c.randomBytes(18).toString(&apos;base64url&apos;));console.log(c.randomBytes(48).toString(&apos;base64url&apos;))&quot;
              </code>
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[10.5px] text-muted-foreground">
        This page is not indexed and never renders the password.
      </p>
    </main>
  );
}
