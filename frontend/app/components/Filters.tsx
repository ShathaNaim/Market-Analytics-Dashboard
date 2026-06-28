type AssetOption = {
  symbol: string;
  name: string;
};

type FiltersProps = {
  assets: AssetOption[];
  selectedSymbol: string;
  days: number;
  currency: string;
  unit: "ounce" | "gram";
  onSymbolChange: (symbol: string) => void;
  onDaysChange: (days: number) => void;
  onCurrencyChange: (currency: string) => void;
  onUnitChange: (unit: "ounce" | "gram") => void;
  onRefresh: () => void;
  loading?: boolean;
};

const dayOptions = [7, 29, 60, 90, 180, 365];
const currencyOptions = ["USD", "JOD", "EUR"];

export default function Filters({
  assets,
  selectedSymbol,
  days,
  currency,
  unit,
  onSymbolChange,
  onDaysChange,
  onCurrencyChange,
  onUnitChange,
  onRefresh,
  loading = false,
}: FiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end">
      <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-slate-700">
        Metal
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-700"
          value={selectedSymbol}
          onChange={(event) => onSymbolChange(event.target.value)}
        >
          {assets.map((asset) => (
            <option key={asset.symbol} value={asset.symbol}>
              {asset.name} ({asset.symbol})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Currency
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-700"
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value)}
        >
          {currencyOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Unit
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-700"
          value={unit}
          onChange={(event) =>
            onUnitChange(event.target.value as "ounce" | "gram")
          }
        >
          <option value="ounce">Ounce</option>
          <option value="gram">Gram</option>
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Range
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-700"
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
        >
          {dayOptions.map((option) => (
            <option key={option} value={option}>
              {option} days
            </option>
          ))}
        </select>
      </label>

      <button
        className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        type="button"
        onClick={onRefresh}
        disabled={loading}
      >
        Refresh
      </button>
    </div>
  );
}
