from django.contrib import admin
from .models import Asset, MarketPrice, Insight
# Register your models here.
admin.site.register(Asset)
admin.site.register(MarketPrice)
admin.site.register(Insight)