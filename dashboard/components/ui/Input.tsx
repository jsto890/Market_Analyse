import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders a leading icon slot (e.g. <Search size={14} />). Default: none. */
  icon?: React.ReactNode;
  /** Marks the field invalid — red border + aria-invalid. Default: false. */
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, invalid = false, className, ...rest },
  ref,
) {
  const inputCls = [
    "h-8 w-full rounded border bg-raised text-body text-foreground placeholder-muted",
    "transition-colors focus:border-accent",
    invalid ? "border-neg" : "border-line",
    icon ? "pl-8 pr-3" : "px-3",
    className ?? "",
  ].join(" ");

  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
      )}
      <input ref={ref} aria-invalid={invalid || undefined} className={inputCls} {...rest} />
    </div>
  );
});

export default Input;
