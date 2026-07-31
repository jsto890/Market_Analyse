import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual treatment. Default: "secondary". */
  variant?: ButtonVariant;
  /** Height/padding. Default: "md" (h-8/32px). "sm" is h-7/28px for dense inline contexts (table row actions). */
  size?: ButtonSize;
  /** Shows a spinner in place of the leading icon slot and disables the button. Default: false. */
  loading?: boolean;
  /** Optional leading icon (e.g. lucide-react component), hidden while loading. */
  icon?: React.ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-accent bg-accent-dim text-accent hover:bg-accent/20",
  secondary: "border-line bg-raised text-foreground hover:border-line-strong",
  danger: "border-neg/50 bg-neg/10 text-neg hover:bg-neg/20",
  ghost: "border-transparent bg-transparent text-muted hover:text-foreground hover:bg-elevated",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-body",
  md: "h-8 px-3.5 text-body",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, disabled, className, children, ...rest },
  ref,
) {
  const cls = [
    "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANT[variant],
    SIZE[size],
    className ?? "",
  ].join(" ");

  return (
    <button ref={ref} type="button" disabled={disabled || loading} className={cls} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default Button;
