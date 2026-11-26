import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AdUnity Admin — Market operations",
  description: "Manage the AdUnity buyer request feed and Auto Bot activation keys.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-canvas min-h-dvh overflow-x-hidden">
      <div className="aurora" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
