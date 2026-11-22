import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-white/10 bg-white/[0.06] text-foreground/75",
        gold: "border-gold/25 bg-gold-soft text-gold",
        success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
        muted: "border-white/8 bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
export type { BadgeProps };
