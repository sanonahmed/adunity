"use client";

import { useEffect, useState } from "react";
import { Check, CircleCheck, LoaderCircle, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type DemoForm = {
  firstName: string;
  lastName: string;
  age: string;
  gender: "" | "male" | "female";
  count: string;
};

const INITIAL_FORM: DemoForm = {
  firstName: "",
  lastName: "",
  age: "",
  gender: "",
  count: "1",
};

const inputClass =
  "h-12 w-full rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none placeholder:text-[#80868b] transition-colors focus:border-[#bf9f6b] focus:ring-2 focus:ring-[#e6d2a8]/30";

const SUFFIX_WORDS = [
  "lee", "max", "ray", "sky", "nova", "ace", "jade", "milo",
  "ivy", "quinn", "wren", "zane", "kai", "luca", "remy",
];

function slugPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function buildSampleAddresses(form: DemoForm, count: number) {
  const first = slugPart(form.firstName) || "user";
  const last = slugPart(form.lastName);
  const base = `${first}${last ? `.${last}` : ""}`.slice(0, 24);
  const used = new Set<string>();
  const addresses: string[] = [];

  for (let index = 0; index < count; index += 1) {
    let address = "";
    do {
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      const word = SUFFIX_WORDS[Math.floor(Math.random() * SUFFIX_WORDS.length)];
      const pattern = index % 3;
      const local =
        pattern === 0 ? `${base}${digits}` : pattern === 1 ? `${base}.${word}` : `${base}.${word}${digits}`;
      address = `${local}@gmail.com`;
    } while (used.has(address));
    used.add(address);
    addresses.push(address);
  }

  return addresses;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-14" role="img" aria-label="Google logo">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.38 3.61v2.96h3.85c2.25-2.07 3.58-5.12 3.58-8.6Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.85-2.96c-1.08.72-2.45 1.15-4.09 1.15-3.14 0-5.8-2.12-6.75-4.96H1.27v3.05A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.25 14.31a7.22 7.22 0 0 1 0-4.62V6.64H1.27a12 12 0 0 0 0 10.72l3.98-3.05Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.36.61 4.61 1.8l3.44-3.44A11.54 11.54 0 0 0 12 0 12 12 0 0 0 1.27 6.64l3.98 3.05C6.2 6.87 8.86 4.75 12 4.75Z" />
    </svg>
  );
}

export function AutoBotPanel({ active }: { active: boolean }) {
  const [demoKey, setDemoKey] = useState("");
  const [activationError, setActivationError] = useState("");
  const [activating, setActivating] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [stage, setStage] = useState<"idle" | "running" | "complete">("idle");
  const [progress, setProgress] = useState(0);
  const [action, setAction] = useState("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(0);
  const total = Math.min(25, Math.max(1, Number(form.count) || 1));
  const totalSteps = total * 3;

  useEffect(() => {
    if (stage !== "running") return;
    let step = 0;
    const phases = ["Preparing demo profile", "Simulating account setup", "Finishing demo profile"];
    const timer = window.setInterval(() => {
      step += 1;
      const profile = Math.ceil(step / phases.length);
      setProgress(Math.round((step / totalSteps) * 100));
      setAction(`${phases[(step - 1) % phases.length]} ${profile} of ${total}`);
      if (step % phases.length === 0) setRevealed(profile);
      if (step >= totalSteps) {
        window.clearInterval(timer);
        setProgress(100);
        setAction(`Demo complete — ${total} profiles simulated. No Gmail accounts were created.`);
        setStage("complete");
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [stage, total, totalSteps]);

  function updateForm<K extends keyof DemoForm>(field: K, value: DemoForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setStage("idle");
    setProgress(0);
    setAction("");
  }

  return (
    <section id="panel-ads" role="tabpanel" aria-labelledby="tab-ads" tabIndex={0} hidden={!active}
      className="panel-enter -mx-5 min-h-[calc(100dvh-10rem)] border-y border-[#e8eaed] bg-white px-5 pb-10 pt-8 text-[#202124] outline-none sm:px-7 sm:pt-10">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        {stage === "idle" ? (
          <>
            <div className="mb-4"><GoogleLogo /></div>
            <p className="mb-7 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
              Demo mode · no accounts are created
            </p>
          </>
        ) : null}

        {!unlocked ? (
          <form className="w-full space-y-4" onSubmit={async (event) => {
            event.preventDefault();
            setActivationError("");
            setActivating(true);
            try {
              const response = await fetch("/api/auto-bot/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: demoKey }),
              });
              if (!response.ok) {
                setActivationError(response.status === 401
                  ? "That activation key was not accepted."
                  : "The activation service is unavailable. Please try again.");
                return;
              }
              setDemoKey("");
              setUnlocked(true);
            } catch {
              setActivationError("Could not reach the activation service. Please try again.");
            } finally {
              setActivating(false);
            }
          }}>
            <label htmlFor="google-api-key" className="sr-only">Server activation key</label>
            <input id="google-api-key" type="password" autoComplete="off" required value={demoKey}
              aria-invalid={activationError ? true : undefined} aria-describedby="activation-help"
              onChange={(event) => {
                setDemoKey(event.target.value);
                setActivationError("");
              }} placeholder="Enter server activation key" className={inputClass} />
            {activationError ? <p role="alert" className="text-xs leading-5 text-[#b42318]">{activationError}</p> : null}
            <Button type="submit" disabled={activating} className="h-12 w-full rounded-xl border border-gold/20 bg-[linear-gradient(180deg,#f8edd3_0%,#e6d2a8_46%,#c9a86f_100%)] text-sm font-semibold text-[#171208] shadow-[0_16px_36px_-18px_rgba(230,210,168,0.42)] hover:brightness-105">
              {activating ? "Checking key…" : "Activate"}
            </Button>
            <p id="activation-help" className="text-center text-xs leading-5 text-[#5f6368]">
              Activation keys are verified securely by the server.
            </p>
          </form>
        ) : stage === "idle" ? (
          <form className="w-full space-y-4" onSubmit={(event) => {
            event.preventDefault();
            setAddresses(buildSampleAddresses(form, total));
            setRevealed(0);
            setProgress(0);
            setAction("Starting demo simulation…");
            setStage("running");
          }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="demo-first-name" className="text-xs font-medium text-[#3c4043]">First name</label>
                <input id="demo-first-name" required maxLength={40} autoComplete="off" value={form.firstName}
                  onChange={(event) => updateForm("firstName", event.target.value)} placeholder="First name" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="demo-last-name" className="text-xs font-medium text-[#3c4043]">Last name</label>
                <input id="demo-last-name" required maxLength={40} autoComplete="off" value={form.lastName}
                  onChange={(event) => updateForm("lastName", event.target.value)} placeholder="Last name" className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="demo-age" className="text-xs font-medium text-[#3c4043]">Age</label>
                <input id="demo-age" type="number" required min={13} max={120} value={form.age}
                  onChange={(event) => updateForm("age", event.target.value)} placeholder="Age" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="demo-gender" className="text-xs font-medium text-[#3c4043]">Gender</label>
                <select id="demo-gender" required value={form.gender}
                  onChange={(event) => updateForm("gender", event.target.value as DemoForm["gender"])} className={inputClass}>
                  <option value="" disabled>Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="simulation-passphrase" className="text-xs font-medium text-[#3c4043]">Simulation passphrase (required)</label>
              <input id="simulation-passphrase" name="simulationPassphrase" type="password" autoComplete="new-password" required placeholder="Enter a simulation-only passphrase" className={inputClass} />
              <p className="text-[11px] leading-4 text-[#5f6368]">Required to continue. This isn’t a Google password and isn’t saved or sent.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="demo-count" className="text-xs font-medium text-[#3c4043]">Number of demo profiles (1–25)</label>
              <input id="demo-count" type="number" required min={1} max={25} step={1} value={form.count}
                onChange={(event) => updateForm("count", event.target.value)} className={inputClass} />
            </div>

            <Button type="submit" className="h-12 w-full rounded-xl border border-gold/20 bg-[linear-gradient(180deg,#f8edd3_0%,#e6d2a8_46%,#c9a86f_100%)] text-sm font-semibold text-[#171208] shadow-[0_16px_36px_-18px_rgba(230,210,168,0.42)] hover:brightness-105">
              Generate demo
            </Button>
          </form>
        ) : (
          <div className="w-full space-y-5" aria-live="polite">
            <div className="relative overflow-hidden rounded-3xl border border-[#e8eaed] bg-[linear-gradient(145deg,#fff,#fffdf8_55%,#fff)] p-5 shadow-[0_18px_48px_-34px_rgba(60,64,67,0.28)] sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-[#e6d2a8]/20 blur-3xl" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#e6d2a8] bg-[#faf5e9] text-[#8a6a35]">
                    {stage === "complete" ? <CircleCheck className="size-5" aria-hidden="true" /> : <Sparkles className="size-5" aria-hidden="true" />}
                  </span>
                  <div><p className="eyebrow text-[#8a6a35]">{stage === "complete" ? "Simulation complete" : "Demo in progress"}</p><h1 className="mt-1 text-lg font-semibold tracking-tight text-[#202124]">{stage === "complete" ? "Your samples are ready" : "Preparing your samples"}</h1></div>
                </div>
                <span className="rounded-full border border-[#e8eaed] bg-[#f8f9fa] px-2.5 py-1 text-[10px] font-medium text-[#5f6368]">DEMO</span>
              </div>
              <div className="relative mt-6 flex items-end justify-between gap-3">
                <p className="min-w-0 text-xs leading-5 text-[#5f6368]">{action}</p>
                <p className="shrink-0 font-mono text-2xl font-semibold tracking-tight text-[#8a6a35] tabular-nums">{progress}<span className="ml-0.5 text-sm">%</span></p>
              </div>
              <div role="progressbar" aria-label="Demo simulation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="relative mt-3 h-2 overflow-hidden rounded-full bg-[#e8eaed]">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#b8965e,#f4e6c6)] shadow-[0_0_18px_rgba(230,210,168,0.38)] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
              </div>
              <div className="relative mt-3 flex items-center justify-between text-[10px] text-[#5f6368]"><span>{form.firstName} {form.lastName}</span><span>{revealed} of {total} samples</span></div>
            </div>

            <div className="w-full overflow-hidden rounded-3xl border border-[#e8eaed] bg-white shadow-[0_18px_48px_-34px_rgba(60,64,67,0.25)]">
              <div className="flex items-start justify-between gap-3 border-b border-[#e8eaed] px-4 py-4 sm:px-5">
                <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e8eaed] bg-[#faf5e9] text-[#8a6a35]"><Mail className="size-4" aria-hidden="true" /></span><div><h2 className="text-sm font-semibold text-[#202124]">Generated samples</h2><p className="mt-1 text-[11px] leading-4 text-[#5f6368]">Fictional examples · not real or verified accounts</p></div></div>
                <span className="rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-2 py-1 font-mono text-[11px] text-[#5f6368] tabular-nums">{revealed}/{total}</span>
              </div>
              <ol className="scrollbar-hide max-h-80 divide-y divide-[#f1f3f4] overflow-y-auto px-3 py-1.5 sm:px-4" aria-label="Fictional sample email addresses">
                {addresses.slice(0, revealed).map((address, index) => (
                  <li key={`${address}-${index}`} className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-[#f8f9fa]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[#e8eaed] bg-[#f8f9fa] font-mono text-[10px] text-[#5f6368] tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 break-all font-mono text-xs font-medium tracking-[0.01em] text-[#3c4043]">{address}</span>
                    {stage === "complete" ? <Check className="size-4 shrink-0 text-[#8a6a35]" aria-hidden="true" /> : null}
                  </li>
                ))}
                {stage === "running" && revealed === 0 ? <li className="flex items-center gap-3 px-2 py-5 text-xs text-[#5f6368]"><LoaderCircle className="size-4 animate-spin text-[#8a6a35]" aria-hidden="true" />Preparing first fictional sample…</li> : null}
              </ol>
              <div className="flex items-start gap-2.5 border-t border-[#e8eaed] bg-[#f8f9fa] px-4 py-3.5 sm:px-5"><span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#bf9f6b]" aria-hidden="true" /><p className="text-[10px] leading-[1.6] text-[#5f6368]">{stage === "complete" ? `${total} fictional addresses shown. No Gmail accounts were created.` : "Addresses are visual demo data only. Nothing is submitted to Google or any account service."}</p></div>
            </div>

            {stage === "complete" ? (
              <Button type="button" onClick={() => {
                setStage("idle");
                setProgress(0);
                setAction("");
                setRevealed(0);
                setAddresses([]);
              }} className="h-12 w-full rounded-xl border border-gold/20 bg-[linear-gradient(180deg,#f8edd3_0%,#e6d2a8_46%,#c9a86f_100%)] text-sm font-semibold text-[#171208] shadow-[0_16px_36px_-18px_rgba(230,210,168,0.42)] hover:brightness-105">
                Create another demo set
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
