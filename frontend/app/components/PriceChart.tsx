type PricePoint = {
  date: string;
  price: number;
};

type PriceChartProps = {
  data: PricePoint[];
  currency: string;
  unit: "ounce" | "gram";
};

const width = 900;
const height = 320;
const padding = {
  top: 28,
  right: 28,
  bottom: 42,
  left: 76,
};

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function PriceChart({ data, currency, unit }: PriceChartProps) {
  const cleanData = data.filter((point) => Number.isFinite(point.price));

  if (cleanData.length < 2) {
    return (
      <section className="flex min-h-[320px] items-center justify-center rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        Not enough price history yet.
      </section>
    );
  }

  const prices = cleanData.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const xForIndex = (index: number) =>
    padding.left + (index / (cleanData.length - 1)) * chartWidth;

  const yForPrice = (price: number) =>
    padding.top + ((maxPrice - price) / priceRange) * chartHeight;

  const path = cleanData
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${xForIndex(index).toFixed(2)} ${yForPrice(point.price).toFixed(2)}`;
    })
    .join(" ");

  const first = cleanData[0];
  const last = cleanData[cleanData.length - 1];
  const change = ((last.price - first.price) / first.price) * 100;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => minPrice + priceRange * ratio,
  );

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Price History</h2>
          <p className="text-sm text-slate-500">
            {formatDate(first.date)} to {formatDate(last.date)} per {unit}
          </p>
        </div>
        <p
          className={`text-sm font-semibold ${
            change >= 0 ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </p>
      </div>

      <div className="overflow-hidden">
        <svg
          className="h-auto w-full"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Selected metal price history chart"
        >
          {gridValues.map((value) => {
            const y = yForPrice(value);
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[12px]"
                >
                  {formatPrice(value, currency)}
                </text>
              </g>
            );
          })}

          <path d={path} fill="none" stroke="#0f172a" strokeWidth="3" />

          {cleanData.map((point, index) => (
            <circle
              key={`${point.date}-${point.price}`}
              cx={xForIndex(index)}
              cy={yForPrice(point.price)}
              r={index === cleanData.length - 1 ? 5 : 3}
              fill={index === cleanData.length - 1 ? "#0f172a" : "#38bdf8"}
            />
          ))}

          <text
            x={padding.left}
            y={height - 12}
            className="fill-slate-500 text-[12px]"
          >
            {formatDate(first.date)}
          </text>
          <text
            x={width - padding.right}
            y={height - 12}
            textAnchor="end"
            className="fill-slate-500 text-[12px]"
          >
            {formatDate(last.date)}
          </text>
        </svg>
      </div>
    </section>
  );
}
