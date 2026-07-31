// dashboard/components/ui/Select.tsx
import { SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, className, ...rest },
  ref,
) {
  const cls = [
    "h-8 w-full cursor-pointer appearance-none rounded border border-line bg-raised",
    "pl-2.5 pr-7 text-body text-foreground focus:border-accent",
    className ?? "",
  ].join(" ");

  return (
    <div className="relative">
      <select ref={ref} className={cls} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
});

export default Select;
