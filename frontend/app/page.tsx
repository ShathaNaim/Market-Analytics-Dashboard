"use client";

import { useEffect, useMemo, useState } from "react";
import Filters from "./components/Filters";
import KpiCard from "./components/KpiCard";
import PriceChart from "./components/PriceChart";

type Asset = {
  id: number;
  symbol: string;
  name: string;
  unit: string;
  is_active: boolean;
};

type MarketPrice = {
  id: number;
  asset: Asset;
  currency: string;
  price: string;
  date: string;
  source: string;
  created_at: string;
};

type MarketOverview = {
  symbol: string;
  name: string;
  currency: string;
  current_price: string;
  change_percent: number;
  highest_price: string;
  lowest_price: string;
  average_price: number;
};

const defaultCurrency = "USD";
const defaultDays = 29;
const TROY_OUNCE_GRAMS = 31.1034768;
const USD_TO_JOD = 0.709;

type DisplayUnit = "ounce" | "gram";

function toNumber(value: string | number | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value: string | number, currency: string) {
  const number = toNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: number >= 100 ? 0 : 2,
  }).format(number);
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

export default function Home() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [overview, setOverview] = useState<MarketOverview[]>([]);
  const [history, setHistory] = useState<MarketPrice[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [unit, setUnit] = useState<DisplayUnit>("ounce");
  const [days, setDays] = useState(defaultDays);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
        setSelectedSymbol((current) => current || activeAssets[0]?.symbol || "");
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
    if (!selectedSymbol) {
      return;
    }

    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const sourceCurrency = sourceCurrencyFor(currency);
        const [overviewData, historyData] = await Promise.all([
          getJson<MarketOverview[]>(
            `/analytics/market-overview?days=${days}&currency=${sourceCurrency}`,
          ),
          getJson<MarketPrice[]>(
            `/analytics/price-history/${selectedSymbol}?days=${days}&currency=${sourceCurrency}`,
          ),
        ]);

        if (!active) {
          return;
        }

        setOverview(overviewData);
        setHistory(historyData);
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load market data.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [selectedSymbol, days, currency]);

  const selectedAsset = assets.find((asset) => asset.symbol === selectedSymbol);
  const selectedOverview = overview.find(
    (item) => item.symbol === selectedSymbol,
  );

  const chartData = useMemo(
    () =>
      history.map((point) => ({
        date: point.date,
        price: convertPrice(point.price, point.currency, currency, unit),
      })),
    [history, currency, unit],
  );

  const latestPoint = history[history.length - 1];
  const firstPoint = history[0];
  const localChange =
    latestPoint && firstPoint
      ? ((toNumber(latestPoint.price) - toNumber(firstPoint.price)) /
          toNumber(firstPoint.price)) *
        100
      : 0;

  async function refreshPrices() {
    setRefreshing(true);
    setError("");

    try {
      const response = await fetch("/analytics/refresh", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currency,
          symbols: selectedSymbol ? [selectedSymbol] : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const sourceCurrency = sourceCurrencyFor(currency);
      const [overviewData, historyData] = await Promise.all([
        getJson<MarketOverview[]>(
          `/analytics/market-overview?days=${days}&currency=${sourceCurrency}`,
        ),
        getJson<MarketPrice[]>(
          `/analytics/price-history/${selectedSymbol}?days=${days}&currency=${sourceCurrency}`,
        ),
      ]);

      setOverview(overviewData);
      setHistory(historyData);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not refresh prices.",
      );
    } finally {
      setRefreshing(false);
    }
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
              Precious Metals Dashboard
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            Tracking stored prices from your backend history, with daily refresh
            support for growing the dataset over time.
          </p>
        </header>

        <Filters
          assets={assets}
          selectedSymbol={selectedSymbol}
          days={days}
          currency={currency}
          unit={unit}
          onSymbolChange={setSelectedSymbol}
          onDaysChange={setDays}
          onCurrencyChange={setCurrency}
          onUnitChange={setUnit}
          onRefresh={refreshPrices}
          loading={refreshing || loading || !selectedSymbol}
        />

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {currency === "JOD" ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            JOD history is converted from saved USD prices using 1 USD = 0.709
            JOD.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Current Price"
            value={
              latestPoint
                ? formatCurrency(
                    convertPrice(
                      latestPoint.price,
                      latestPoint.currency,
                      currency,
                      unit,
                    ),
                    currency,
                  )
                : selectedOverview
                  ? formatCurrency(
                      convertPrice(
                        selectedOverview.current_price,
                        selectedOverview.currency,
                        currency,
                        unit,
                      ),
                      currency,
                    )
                  : "--"
            }
            detail={selectedAsset ? `${selectedAsset.name} per ${unit}` : ""}
          />
          <KpiCard
            label={`${days} Day Change`}
            value={`${localChange >= 0 ? "+" : ""}${localChange.toFixed(2)}%`}
            detail={history.length ? `${history.length} saved points` : "No saved points"}
            tone={localChange >= 0 ? "positive" : "negative"}
          />
          <KpiCard
            label="High"
            value={
              selectedOverview
                ? formatCurrency(
                    convertPrice(
                      selectedOverview.highest_price,
                      selectedOverview.currency,
                      currency,
                      unit,
                    ),
                    currency,
                  )
                : "--"
            }
          />
          <KpiCard
            label="Low"
            value={
              selectedOverview
                ? formatCurrency(
                    convertPrice(
                      selectedOverview.lowest_price,
                      selectedOverview.currency,
                      currency,
                      unit,
                    ),
                    currency,
                  )
                : "--"
            }
          />
        </section>

        <PriceChart data={chartData} currency={currency} unit={unit} />

        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-950">
              Recent Prices
            </h2>
            <span className="text-sm text-slate-500">
              {loading ? "Loading..." : `${history.length} rows`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((point) => (
                    <tr key={point.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatDate(point.date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">
                        {point.asset.symbol}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatCurrency(
                          convertPrice(
                            point.price,
                            point.currency,
                            currency,
                            unit,
                          ),
                          currency,
                        )}{" "}
                        / {unit}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {point.source}
                      </td>
                    </tr>
                  ))}
                {!loading && history.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-slate-500"
                      colSpan={4}
                    >
                      No saved prices match this filter.
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
