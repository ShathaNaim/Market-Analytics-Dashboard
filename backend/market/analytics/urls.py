from django.urls import path
from .views import (
    AssetListView,
    LatestPricesView,
    MarketOverviewView,
    PriceHistoryView,
    RefreshMarketDataView,
)

urlpatterns = [
    path('assets/', AssetListView.as_view(), name='asset-list'),
    path('latest-prices/', LatestPricesView.as_view(), name='latest-prices'),
    path('price-history/<str:asset_symbol>/', PriceHistoryView.as_view(), name='price-history'),
    path('market-overview/', MarketOverviewView.as_view(), name='market-overview'),
    path('refresh/', RefreshMarketDataView.as_view(), name='refresh-market-data'),
]
