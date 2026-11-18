import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white hover:bg-brand-700 shadow",
        secondary: "bg-brand-100 text-brand-900 hover:bg-brand-200",
        outline: "border-2 border-brand-200 bg-white text-brand-900 hover:bg-brand-50",
        ghost: "text-brand-900 hover:bg-brand-100",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
      },
      size: {
        default: "h-11 px-5",
        lg: "h-14 px-7 text-base", // large touch-friendly teacher buttons
        sm: "h-9 px-3 text-xs",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
export { buttonVariants };
