from django.urls import path
from .views import (
    AssetListView,
    LatestPricesView,
    MarketOverviewView,
    PriceHistoryView,
    RefreshMarketDataView,
    BackfillMarketHistoryView,
)

urlpatterns = [
    path('assets', AssetListView.as_view(), name='asset-list-no-slash'),
    path('assets/', AssetListView.as_view(), name='asset-list'),
    path('latest-prices', LatestPricesView.as_view(), name='latest-prices-no-slash'),
    path('latest-prices/', LatestPricesView.as_view(), name='latest-prices'),
    path('price-history/<str:asset_symbol>', PriceHistoryView.as_view(), name='price-history-no-slash'),
    path('price-history/<str:asset_symbol>/', PriceHistoryView.as_view(), name='price-history'),
    path('market-overview', MarketOverviewView.as_view(), name='market-overview-no-slash'),
    path('market-overview/', MarketOverviewView.as_view(), name='market-overview'),
    path('refresh', RefreshMarketDataView.as_view(), name='refresh-market-data-no-slash'),
    path('refresh/', RefreshMarketDataView.as_view(), name='refresh-market-data'),
    path('backfill-history', BackfillMarketHistoryView.as_view(), name='backfill-market-history-no-slash'),
    path('backfill-history/', BackfillMarketHistoryView.as_view(), name='backfill-market-history'),
]
