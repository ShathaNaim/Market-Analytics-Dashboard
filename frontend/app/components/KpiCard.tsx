type KpiCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "negative";
};

export default function KpiCard({
  label,
  value,
  detail,
  tone = "neutral",
}: KpiCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-700"
        : "text-slate-900";

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </section>
  );
}
