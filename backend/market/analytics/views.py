from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
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
# Create your views here.





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
            start_date = timezone.now().date() - timedelta(days=int(days))
            queryset = queryset.filter(date__gte=start_date)

        if currency:
            queryset = queryset.filter(currency=currency.strip().upper())

        queryset = queryset.order_by("date")

        serializer = MarketPriceSerializer(queryset, many=True)
        return Response(serializer.data)


class MarketOverviewView(APIView):
    def get(self, request):
        days = int(request.query_params.get("days", 30))
        currency = request.query_params.get("currency", "USD")

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
        pass

class InsightsView(APIView):
    def get(self, request, format=None):
        insights = Insight.objects.all().order_by('-created_at')
        serializer = InsightSerializer(insights, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class RefreshMarketDataView(APIView):
    def post(self, request, format=None):
        currency = request.data.get("currency", "USD")
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
    def post(self, request, format=None):
        currency = request.data.get("currency", "USD")
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
