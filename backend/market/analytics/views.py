from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import BasePermission
from django.conf import settings
from .models import Asset, MarketPrice, Insight
from .serializers import AssetSerializer, MarketPriceSerializer, InsightSerializer
from rest_framework import generics
from datetime import timedelta
from django.utils import timezone
from django.db.models import Max, Min, Avg
from .services import (
    MetalPriceAPIError,
    MetalPriceRateLimitError,
    MetalPriceService,
    MetalPriceTimeoutError,
)
def parse_days(value, default=30):
    try:
        days = int(value or default)
    except (TypeError, ValueError):
        return None, Response(
            {"error": "days must be a valid number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if days < 1:
        return None, Response(
            {"error": "days must be at least 1."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return days, None


class IsAdminUserOrDebug(BasePermission):
    def has_permission(self, request, view):
        return settings.DEBUG or bool(
            request.user and request.user.is_staff
        )


class AssetListView(generics.ListAPIView):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer


class LatestPricesView(APIView):
    def get(self, request, format=None):
        assets = Asset.objects.filter(is_active=True)
        data = []

        for asset in assets:
            latest_price = asset.prices.order_by('-date').first()
            if latest_price:
                serializer = MarketPriceSerializer(latest_price)
                data.append(serializer.data)

        return Response(data, status=status.HTTP_200_OK)


class PriceHistoryView(APIView):
    def get(self, request, asset_symbol):
        try:
            asset = Asset.objects.get(symbol=asset_symbol)
        except Asset.DoesNotExist:
            return Response(
                {"error": "Asset not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        queryset = asset.prices.all()

        days = request.query_params.get("days")
        currency = request.query_params.get("currency")

        if days:
            parsed_days, error_response = parse_days(days)
            if error_response:
                return error_response

            start_date = timezone.now().date() - timedelta(days=parsed_days)
            queryset = queryset.filter(date__gte=start_date)

        if currency:
            queryset = queryset.filter(currency=currency.strip().upper())

        queryset = queryset.order_by("date")

        serializer = MarketPriceSerializer(queryset, many=True)
        return Response(serializer.data)


class MarketOverviewView(APIView):
    def get(self, request):
        days, error_response = parse_days(request.query_params.get("days"), 30)
        if error_response:
            return error_response

        currency = request.query_params.get("currency", "USD").strip().upper()

        start_date = timezone.now().date() - timedelta(days=days)

        result = []

        for asset in Asset.objects.filter(is_active=True):
            prices = asset.prices.filter(
                currency=currency,
                date__gte=start_date
            ).order_by("date")

            if not prices.exists():
                continue

            latest = prices.last()
            first = prices.first()

            stats = prices.aggregate(
                highest_price=Max("price"),
                lowest_price=Min("price"),
                average_price=Avg("price"),
            )

            change_percent = (
                (latest.price - first.price) / first.price * 100
                if first.price else 0
            )

            result.append({
                "symbol": asset.symbol,
                "name": asset.name,
                "currency": currency,
                "current_price": latest.price,
                "change_percent": round(change_percent, 2),
                "highest_price": stats["highest_price"],
                "lowest_price": stats["lowest_price"],
                "average_price": round(stats["average_price"], 2),
            })

        return Response(result)
       

class MarketComparisonView(APIView):
    def get(self, request):
        days, error_response = parse_days(request.query_params.get("days"), 30)
        if error_response:
            return error_response

        currency = request.query_params.get("currency", "USD").strip().upper()
        symbols = request.query_params.get("symbols")
        start_date = timezone.now().date() - timedelta(days=days)

        assets = Asset.objects.filter(is_active=True)
        if symbols:
            symbol_list = [
                symbol.strip().upper()
                for symbol in symbols.split(",")
                if symbol.strip()
            ]
            assets = assets.filter(symbol__in=symbol_list)

        comparison = []

        for asset in assets.order_by("symbol"):
            prices = asset.prices.filter(
                currency=currency,
                date__gte=start_date,
            ).order_by("date")

            if not prices.exists():
                continue

            first = prices.first()
            latest = prices.last()
            stats = prices.aggregate(
                highest_price=Max("price"),
                lowest_price=Min("price"),
                average_price=Avg("price"),
            )

            change_amount = latest.price - first.price
            change_percent = (
                change_amount / first.price * 100
                if first.price else 0
            )

            comparison.append({
                "symbol": asset.symbol,
                "name": asset.name,
                "unit": asset.unit,
                "currency": currency,
                "start_price": first.price,
                "current_price": latest.price,
                "change_amount": round(change_amount, 4),
                "change_percent": round(change_percent, 2),
                "highest_price": stats["highest_price"],
                "lowest_price": stats["lowest_price"],
                "average_price": round(stats["average_price"], 2),
                "prices": [
                    {
                        "date": price.date,
                        "price": price.price,
                        "normalized_price": round(
                            price.price / first.price * 100,
                            2,
                        ) if first.price else 0,
                    }
                    for price in prices
                ],
            })

        return Response({
            "currency": currency,
            "days": days,
            "start_date": start_date,
            "assets": comparison,
        })

class InsightsView(APIView):
    def get(self, request, format=None):
        days, error_response = parse_days(request.query_params.get("days"), 30)
        if error_response:
            return error_response

        currency = request.query_params.get("currency", "USD").strip().upper()
        start_date = timezone.now().date() - timedelta(days=days)
        summaries = []

        for asset in Asset.objects.filter(is_active=True).order_by("symbol"):
            prices = asset.prices.filter(
                currency=currency,
                date__gte=start_date,
            ).order_by("date")

            if prices.count() < 2:
                continue

            first = prices.first()
            latest = prices.last()
            stats = prices.aggregate(
                highest_price=Max("price"),
                lowest_price=Min("price"),
                average_price=Avg("price"),
            )
            change_percent = (
                (latest.price - first.price) / first.price * 100
                if first.price else 0
            )
            volatility_percent = (
                (stats["highest_price"] - stats["lowest_price"])
                / stats["average_price"]
                * 100
                if stats["average_price"] else 0
            )

            summaries.append({
                "asset": asset,
                "change_percent": round(change_percent, 2),
                "volatility_percent": round(volatility_percent, 2),
                "latest": latest,
                "highest_price": stats["highest_price"],
            })

        insights = []

        if summaries:
            best = max(summaries, key=lambda item: item["change_percent"])
            worst = min(summaries, key=lambda item: item["change_percent"])
            most_volatile = max(
                summaries,
                key=lambda item: item["volatility_percent"],
            )
            least_volatile = min(
                summaries,
                key=lambda item: item["volatility_percent"],
            )

            insights.append({
                "title": (
                    f"{best['asset'].name} outperformed "
                    f"{worst['asset'].name}"
                    if best["asset"] != worst["asset"]
                    else f"{best['asset'].name} performance"
                ),
                "message": (
                    f"{best['asset'].name} changed "
                    f"{best['change_percent']}%, while "
                    f"{worst['asset'].name} changed "
                    f"{worst['change_percent']}% over the selected period."
                    if best["asset"] != worst["asset"]
                    else (
                        f"{best['asset'].name} changed "
                        f"{best['change_percent']}% over the selected period."
                    )
                ),
                "insight_type": "performance",
                "asset": AssetSerializer(best["asset"]).data,
            })

            if worst["change_percent"] < 0:
                insights.append({
                    "title": (
                        f"{worst['asset'].name} recorded the largest decline"
                    ),
                    "message": (
                        f"{worst['asset'].name} lost "
                        f"{abs(worst['change_percent'])}% during the "
                        f"selected period."
                    ),
                    "insight_type": "trend",
                    "asset": AssetSerializer(worst["asset"]).data,
                })

            if most_volatile["volatility_percent"] > 0:
                insights.append({
                    "title": (
                        f"{most_volatile['asset'].name} was more volatile"
                    ),
                    "message": (
                        f"{most_volatile['asset'].name} experienced a "
                        f"{most_volatile['volatility_percent']}% trading "
                        f"range"
                        + (
                            f", indicating higher price fluctuations than "
                            f"{least_volatile['asset'].name}."
                            if most_volatile["asset"] != least_volatile["asset"]
                            else "."
                        )
                    ),
                    "insight_type": "volatility",
                    "asset": AssetSerializer(most_volatile["asset"]).data,
                })

            for summary in summaries:
                if summary["latest"].price == summary["highest_price"]:
                    insights.append({
                        "title": (
                            f"{summary['asset'].name} reached a period high"
                        ),
                        "message": (
                            f"{summary['asset'].name} closed at its highest "
                            f"saved {currency} price in the last {days} days."
                        ),
                        "insight_type": "trend",
                        "asset": AssetSerializer(summary["asset"]).data,
                    })

        saved_insights = InsightSerializer(
            Insight.objects.all().order_by("-created_at")[:5],
            many=True,
        ).data

        return Response({
            "currency": currency,
            "days": days,
            "generated": insights,
            "saved": saved_insights,
        }, status=status.HTTP_200_OK)

class RefreshMarketDataView(APIView):
    permission_classes = [IsAdminUserOrDebug]

    def post(self, request, format=None):
        currency = request.data.get("currency", "USD").strip().upper()
        symbols = request.data.get("symbols")

        if symbols is not None and not isinstance(symbols, list):
            return Response(
                {"error": "symbols must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = MetalPriceService().refresh_latest_prices(
                currency=currency,
                symbols=symbols,
            )
        except MetalPriceRateLimitError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except MetalPriceTimeoutError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except MetalPriceAPIError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "message": "Market prices refreshed.",
                "created": result["created"],
                "updated": result["updated"],
                "prices": MarketPriceSerializer(
                    result["prices"],
                    many=True,
                ).data,
                "quota": result["quota"],
            },
            status=status.HTTP_200_OK
        )

class BackfillMarketHistoryView(APIView):
    permission_classes = [IsAdminUserOrDebug]

    def post(self, request, format=None):
        currency = request.data.get("currency", "USD").strip().upper()
        symbols = request.data.get("symbols")
        days = request.data.get("days", 29)

        if symbols is not None and not isinstance(symbols, list):
            return Response(
                {"error": "symbols must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = MetalPriceService().backfill_historical_prices(
                currency=currency,
                symbols=symbols,
                days=days,
            )
        except ValueError:
            return Response(
                {"error": "days must be a valid number."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except MetalPriceRateLimitError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except MetalPriceTimeoutError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except MetalPriceAPIError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({
            "message": "Historical prices backfilled.",
            "created": result["created"],
            "updated": result["updated"],
            "start_date": result["start_date"],
            "end_date": result["end_date"],
            "currency": currency,
            "symbols": symbols,
        })
