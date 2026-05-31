type Props = {
  title?: string;
  message?: string;
};

export default function AccessDenied({
  title = "Access denied",
  message = "You don't have permission to view this page.",
}: Props) {
  return (
    <div className="p-6">
      <div className="max-w-xl rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger-soft)] p-4">
        <div className="text-lg font-semibold dash-text">{title}</div>
        <div className="mt-2 text-sm dash-text">{message}</div>
      </div>
    </div>
  );
}

