import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Consistent page title row: accent-tick title, optional subtitle + actions. */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-line pb-3">
      <div className="min-w-0">
        <h1 className="tick text-[15px] font-semibold leading-none text-foreground">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[12px] leading-none text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
