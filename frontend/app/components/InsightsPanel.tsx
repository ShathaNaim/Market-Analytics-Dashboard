"use client";

import { useEffect, useMemo, useState } from "react";

type Asset = {
  id: number;
  symbol: string;
  name: string;
  unit: string;
  is_active: boolean;
};

type Insight = {
  title: string;
  message: string;
  insight_type: string;
  asset: Asset | null;
};

type InsightsResponse = {
  currency: string;
  days: number;
  generated: Insight[];
  saved: Insight[];
};

type InsightsPanelProps = {
  days: number;
  currency: string;
};

const insightLabels: Record<string, string> = {
  performance: "Performance",
  trend: "Trend",
  volatility: "Volatility",
};

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

export default function InsightsPanel({ days, currency }: InsightsPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadInsights() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          days: String(days),
          currency,
        });
        const data = await getJson<InsightsResponse>(
          `/analytics/insights?${params.toString()}`,
        );

        if (!active) {
          return;
        }

        setInsights([...data.generated, ...data.saved].slice(0, 6));
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Could not load insights.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadInsights();

    return () => {
      active = false;
    };
  }, [days, currency]);

  const statusText = useMemo(() => {
    if (loading) {
      return "Loading...";
    }

    return insights.length === 1 ? "1 insight" : `${insights.length} insights`;
  }, [insights.length, loading]);

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Market Insights
          </h2>
          <p className="text-sm text-slate-500">
            Rule-based signals from saved price history.
          </p>
        </div>
        <span className="text-sm text-slate-500">{statusText}</span>
      </div>

      {error ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight, index) => (
          <article
            className="rounded-md border border-slate-200 bg-slate-50 p-4"
            key={`${insight.title}-${index}`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {insightLabels[insight.insight_type] || insight.insight_type}
              </span>
              {insight.asset ? (
                <span className="text-xs font-semibold text-slate-500">
                  {insight.asset.symbol}
                </span>
              ) : null}
            </div>
            <h3 className="text-sm font-semibold text-slate-950">
              {insight.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {insight.message}
            </p>
          </article>
        ))}

        {!loading && insights.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            Not enough saved history to generate insights yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}
