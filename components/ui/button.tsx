import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full",
    "text-sm font-semibold outline-none",
    "transition-[transform,background-color,border-color,color,box-shadow,filter] duration-200",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(180deg,#f8edd3_0%,#e6d2a8_46%,#c9a86f_100%)] text-[#171208] shadow-[0_16px_36px_-18px_rgba(230,210,168,0.8),inset_0_1px_0_rgba(255,255,255,0.6)] hover:brightness-[1.04]",
        outline:
          "border border-white/12 bg-white/[0.03] text-foreground hover:border-white/20 hover:bg-white/[0.06]",
        secondary: "bg-white/[0.07] text-foreground hover:bg-white/[0.1]",
        ghost:
          "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
        link: "text-gold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 gap-1.5 px-3.5 text-[13px]",
        lg: "h-[3.3rem] px-7 text-[15px]",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
