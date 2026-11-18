import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-brand-100 bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-extrabold text-brand-950", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-2", className)} {...props} />;
}

export function Badge({ className, tone = "brand", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "brand" | "green" | "red" | "amber" | "gray" }) {
  const tones = {
    brand: "bg-brand-100 text-brand-800",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-700",
  };
  return <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-bold", tones[tone], className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-12 w-full rounded-xl border border-brand-200 bg-white px-4 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 placeholder:text-gray-400", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn("min-h-[110px] w-full rounded-xl border border-brand-200 bg-white p-4 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 placeholder:text-gray-400", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("h-12 w-full rounded-xl border border-brand-200 bg-white px-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-bold text-brand-900", className)} {...props} />;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-3 w-full overflow-hidden rounded-full bg-brand-100", className)}>
      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
