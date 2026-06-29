"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import InsightsPanel from "../components/InsightsPanel";

type Asset = {
  id: number;
  symbol: string;
  name: string;
  unit: string;
  is_active: boolean;
};

type ComparisonPoint = {
  date: string;
  price: string;
  normalized_price: number;
};

type ComparisonAsset = {
  symbol: string;
  name: string;
  unit: string;
  currency: string;
  start_price: string;
  current_price: string;
  change_amount: number;
  change_percent: number;
  highest_price: string;
  lowest_price: string;
  average_price: number;
  prices: ComparisonPoint[];
};

type ComparisonResponse = {
  currency: string;
  days: number;
  start_date: string;
  assets: ComparisonAsset[];
};

type DisplayUnit = "ounce" | "gram";

const defaultCurrency = "USD";
const defaultDays = 29;
const TROY_OUNCE_GRAMS = 31.1034768;
const USD_TO_JOD = 0.709;
const chartWidth = 900;
const chartHeight = 340;
const chartPadding = {
  top: 28,
  right: 36,
  bottom: 42,
  left: 64,
};
const lineColors = ["#0f172a", "#0284c7", "#059669", "#b45309", "#7c3aed"];
const assetColors: Record<string, string> = {
  XAU: "#d4a017",
  XAG: "#94a3b8",
  XPT: "#64748b",
  XPD: "#0f766e",
};

function colorForAsset(symbol: string, index: number) {
  return assetColors[symbol.toUpperCase()] || lineColors[index % lineColors.length];
}

function toNumber(value: string | number | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sourceCurrencyFor(displayCurrency: string) {
  return displayCurrency === "JOD" ? "USD" : displayCurrency;
}

function convertPrice(
  value: string | number,
  storedCurrency: string,
  displayCurrency: string,
  unit: DisplayUnit,
) {
  let price = toNumber(value);
  const sourceCurrency = storedCurrency.toUpperCase();
  const targetCurrency = displayCurrency.toUpperCase();

  if (sourceCurrency === "USD" && targetCurrency === "JOD") {
    price *= USD_TO_JOD;
  }

  if (sourceCurrency === "JOD" && targetCurrency === "USD") {
    price /= USD_TO_JOD;
  }

  return unit === "gram" ? price / TROY_OUNCE_GRAMS : price;
}

function formatCurrency(value: string | number, currency: string) {
  const number = toNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: number >= 100 ? 0 : 2,
  }).format(number);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function ComparisonChart({ assets }: { assets: ComparisonAsset[] }) {
  const series = assets.filter((asset) => asset.prices.length >= 2);

  if (series.length === 0) {
    return (
      <section className="flex min-h-[340px] items-center justify-center rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        Not enough saved history to compare these assets.
      </section>
    );
  }

  const values = series.flatMap((asset) =>
    asset.prices.map((point) => toNumber(point.normalized_price)),
  );
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => minValue + valueRange * ratio,
  );

  const xForIndex = (index: number, total: number) =>
    chartPadding.left + (index / Math.max(total - 1, 1)) * innerWidth;

  const yForValue = (value: number) =>
    chartPadding.top + ((maxValue - value) / valueRange) * innerHeight;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Normalized Performance
          </h2>
          <p className="text-sm text-slate-500">
            Each asset starts at 100 for easier comparison.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {series.map((asset, index) => (
            <span
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"
              key={asset.symbol}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colorForAsset(asset.symbol, index) }}
              />
              {asset.symbol}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden">
        <svg
          className="h-auto w-full"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label="Normalized market comparison chart"
        >
          {gridValues.map((value) => {
            const y = yForValue(value);
            return (
              <g key={value}>
                <line
                  x1={chartPadding.left}
                  x2={chartWidth - chartPadding.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                />
                <text
                  x={chartPadding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[12px]"
                >
                  {value.toFixed(0)}
                </text>
              </g>
            );
          })}

          {series.map((asset, assetIndex) => {
            const path = asset.prices
              .map((point, pointIndex) => {
                const command = pointIndex === 0 ? "M" : "L";
                return `${command} ${xForIndex(pointIndex, asset.prices.length).toFixed(2)} ${yForValue(toNumber(point.normalized_price)).toFixed(2)}`;
              })
              .join(" ");

            return (
              <g key={asset.symbol}>
                <path
                  d={path}
                  fill="none"
                  stroke={colorForAsset(asset.symbol, assetIndex)}
                  strokeWidth="3"
                />
                {asset.prices.map((point, pointIndex) => (
                  <circle
                    key={`${asset.symbol}-${point.date}`}
                    cx={xForIndex(pointIndex, asset.prices.length)}
                    cy={yForValue(toNumber(point.normalized_price))}
                    r={pointIndex === asset.prices.length - 1 ? 4 : 2.5}
                    fill={colorForAsset(asset.symbol, assetIndex)}
                  />
                ))}
              </g>
            );
          })}

          <text
            x={chartPadding.left}
            y={chartHeight - 12}
            className="fill-slate-500 text-[12px]"
          >
            {formatDate(series[0].prices[0].date)}
          </text>
          <text
            x={chartWidth - chartPadding.right}
            y={chartHeight - 12}
            textAnchor="end"
            className="fill-slate-500 text-[12px]"
          >
            {formatDate(series[0].prices[series[0].prices.length - 1].date)}
          </text>
        </svg>
      </div>
    </section>
  );
}

function ReturnBarChart({ assets }: { assets: ComparisonAsset[] }) {
  if (assets.length === 0) {
    return (
      <section className="flex min-h-[260px] items-center justify-center rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        Select at least one asset to see return performance.
      </section>
    );
  }

  const returns = assets.map((asset) => asset.change_percent);
  const maxMagnitude = Math.max(...returns.map((value) => Math.abs(value)), 1);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Return Comparison
          </h2>
          <p className="text-sm text-slate-500">
            Percent change over the selected range.
          </p>
        </div>
        <span className="text-sm text-slate-500">{assets.length} assets</span>
      </div>

      <div className="space-y-3">
        {assets.map((asset, index) => {
          const positive = asset.change_percent >= 0;
          const width = `${Math.max(
            (Math.abs(asset.change_percent) / maxMagnitude) * 100,
            2,
          )}%`;

          return (
            <div
              className="grid gap-2 sm:grid-cols-[8rem_1fr_5rem] sm:items-center"
              key={asset.symbol}
            >
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {asset.symbol}
                </p>
                <p className="text-xs text-slate-500">{asset.name}</p>
              </div>
              <div className="h-9 rounded-md bg-slate-100 p-1">
                <div
                  className={`h-full rounded ${
                    positive ? "bg-emerald-600" : "bg-red-600"
                  }`}
                  style={{
                    width,
                    backgroundColor: colorForAsset(asset.symbol, index),
                  }}
                />
              </div>
              <p
                className={`text-sm font-semibold sm:text-right ${
                  positive ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {positive ? "+" : ""}
                {asset.change_percent.toFixed(2)}%
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ComparisonPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonAsset[]>([]);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [unit, setUnit] = useState<DisplayUnit>("ounce");
  const [days, setDays] = useState(defaultDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAssets() {
      try {
        const assetData = await getJson<Asset[]>("/analytics/assets");
        if (!active) {
          return;
        }

        const activeAssets = assetData.filter((asset) => asset.is_active);
        setAssets(activeAssets);
        setSelectedSymbols(activeAssets.slice(0, 3).map((asset) => asset.symbol));
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Could not load assets.",
          );
        }
      }
    }

    loadAssets();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSymbols.length === 0) {
      return;
    }

    let active = true;

    async function loadComparison() {
      setLoading(true);
      setError("");

      try {
        const sourceCurrency = sourceCurrencyFor(currency);
        const params = new URLSearchParams({
          symbols: selectedSymbols.join(","),
          days: String(days),
          currency: sourceCurrency,
        });
        const data = await getJson<ComparisonResponse>(
          `/analytics/market-comparison?${params.toString()}`,
        );

        if (!active) {
          return;
        }

        setComparison(data.assets);
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load comparison data.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadComparison();

    return () => {
      active = false;
    };
  }, [selectedSymbols, days, currency]);

  const convertedAssets = useMemo(
    () =>
      comparison.map((asset) => ({
        ...asset,
        displayCurrentPrice: convertPrice(
          asset.current_price,
          asset.currency,
          currency,
          unit,
        ),
        displayHighestPrice: convertPrice(
          asset.highest_price,
          asset.currency,
          currency,
          unit,
        ),
        displayLowestPrice: convertPrice(
          asset.lowest_price,
          asset.currency,
          currency,
          unit,
        ),
        displayAveragePrice: convertPrice(
          asset.average_price,
          asset.currency,
          currency,
          unit,
        ),
      })),
    [comparison, currency, unit],
  );

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((current) => {
      const next = current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol];

      if (next.length === 0) {
        setComparison([]);
      }

      return next;
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">
              Market Analytics
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              Market Comparison
            </h1>
          </div>
          <div className="flex max-w-xl flex-col gap-3 lg:items-end">
       
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:border-slate-900 hover:bg-slate-100"
              href="/"
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Metals</p>
              <div className="flex flex-wrap gap-2">
                {assets.map((asset) => {
                  const selected = selectedSymbols.includes(asset.symbol);
                  return (
                    <button
                      className={`h-10 rounded-md border px-3 text-sm font-semibold transition ${
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
                      }`}
                      key={asset.symbol}
                      onClick={() => toggleSymbol(asset.symbol)}
                      type="button"
                    >
                      {asset.symbol}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Currency
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-700"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="USD">USD</option>
                <option value="JOD">JOD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Unit
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-700"
                value={unit}
                onChange={(event) => setUnit(event.target.value as DisplayUnit)}
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
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {[7, 29, 60, 90, 180, 365].map((option) => (
                  <option key={option} value={option}>
                    {option} days
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {currency === "JOD" ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            JOD values are converted from saved USD prices using 1 USD = 0.709
            JOD.
          </div>
        ) : null}

        <ReturnBarChart assets={comparison} />

        <ComparisonChart assets={comparison} />

        <InsightsPanel days={days} currency={sourceCurrencyFor(currency)} />

        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-950">
              Comparison Summary
            </h2>
            <span className="text-sm text-slate-500">
              {loading ? "Loading..." : `${convertedAssets.length} assets`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">High</th>
                  <th className="px-4 py-3">Low</th>
                  <th className="px-4 py-3">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {convertedAssets.map((asset) => (
                  <tr key={asset.symbol}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold text-slate-950">
                        {asset.name}
                      </div>
                      <div className="text-xs text-slate-500">{asset.symbol}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatCurrency(asset.displayCurrentPrice, currency)} /{" "}
                      {unit}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 font-semibold ${
                        asset.change_percent >= 0
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {asset.change_percent >= 0 ? "+" : ""}
                      {asset.change_percent.toFixed(2)}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatCurrency(asset.displayHighestPrice, currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatCurrency(asset.displayLowestPrice, currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatCurrency(asset.displayAveragePrice, currency)}
                    </td>
                  </tr>
                ))}
                {!loading && convertedAssets.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-slate-500"
                      colSpan={6}
                    >
                      No saved prices match this comparison.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
