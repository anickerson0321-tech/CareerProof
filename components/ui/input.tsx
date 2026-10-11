import * as React from "react";
import { cn } from "@/lib/utils";

const fieldClasses =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted/80 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, "min-h-11 py-2", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold text-fg", className)} {...props} />;
}
