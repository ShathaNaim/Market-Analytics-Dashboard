from django.db import models

# Create your models here.
class Asset(models.Model):
    symbol = models.CharField(max_length=10, unique=True)  # XAU, XAG
    name = models.CharField(max_length=50)  # Gold, Silver
    unit = models.CharField(max_length=20, default="ounce")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.symbol})"


class MarketPrice(models.Model):
    asset = models.ForeignKey(
        Asset,
        on_delete=models.CASCADE,
        related_name="prices"
    )
    currency = models.CharField(max_length=10, default="USD")  # USD, JOD, EUR
    price = models.DecimalField(max_digits=12, decimal_places=4)
    date = models.DateField()
    source = models.CharField(max_length=100, default="MetalpriceAPI")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("asset", "currency", "date")
        ordering = ["-date"]

    def __str__(self):
        return f"{self.asset.symbol} - {self.price} {self.currency} - {self.date}"


class Insight(models.Model):
    asset = models.ForeignKey(
        Asset,
        on_delete=models.CASCADE,
        related_name="insights",
        null=True,
        blank=True
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    insight_type = models.CharField(max_length=50)  # trend, volatility, performance
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title