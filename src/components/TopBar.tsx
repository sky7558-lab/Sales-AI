export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-end justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-muted">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
