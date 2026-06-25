from .models import Asset, MarketPrice, Insight
from rest_framework import serializers


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ['id', 'symbol', 'name', 'unit', 'is_active']

class MarketPriceSerializer(serializers.ModelSerializer):
    asset = AssetSerializer(read_only=True)

    class Meta:
        model = MarketPrice
        fields = ['id', 'asset', 'currency', 'price', 'date', 'source', 'created_at']

class InsightSerializer(serializers.ModelSerializer):
    asset = AssetSerializer(read_only=True)

    class Meta:
        model = Insight
        fields = ['id', 'asset', 'title', 'message', 'insight_type', 'created_at']