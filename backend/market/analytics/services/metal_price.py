import json
import socket
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction

from ..models import Asset, MarketPrice


class MetalPriceAPIError(Exception):
    """Base error raised when MetalpriceAPI cannot provide usable data."""


class MetalPriceConfigurationError(MetalPriceAPIError):
    pass


class MetalPriceTimeoutError(MetalPriceAPIError):
    pass


class MetalPriceRateLimitError(MetalPriceAPIError):
    pass


class MetalPriceInvalidResponseError(MetalPriceAPIError):
    pass


class MetalPriceService:
    SOURCE = "MetalpriceAPI"
    RATE_LIMIT_CODES = {104, 105}
    PRICE_PLACES = Decimal("0.0001")

    def __init__(self, api_key=None, base_url=None, timeout=None):
        self.api_key = api_key or settings.METAL_PRICE_API_KEY
        self.base_url = (
            base_url or settings.METAL_PRICE_API_BASE_URL
        ).rstrip("/")
        self.timeout = timeout or settings.METAL_PRICE_API_TIMEOUT

        if not self.api_key:
            raise MetalPriceConfigurationError(
                "METAL_PRICE_API_KEY is not configured."
            )

    def refresh_latest_prices(self, currency="USD", symbols=None):
        currency = currency.strip().upper()
        assets = Asset.objects.filter(is_active=True)

        if symbols:
            normalized_symbols = {
                symbol.strip().upper() for symbol in symbols if symbol.strip()
            }
            assets = assets.filter(symbol__in=normalized_symbols)

        assets = list(assets)
        if not assets:
            return {
                "created": 0,
                "updated": 0,
                "prices": [],
                "quota": {"current": None, "limit": None},
            }

        payload, quota = self._request_latest(
            currency=currency,
            symbols=[asset.symbol for asset in assets],
        )
        price_date = self._response_date(payload)
        rates = payload.get("rates")

        if not isinstance(rates, dict):
            raise MetalPriceInvalidResponseError(
                "MetalpriceAPI response does not contain a rates object."
            )

        created_count = 0
        updated_count = 0
        saved_prices = []

        with transaction.atomic():
            for asset in assets:
                price = self._extract_price(
                    rates=rates,
                    currency=currency,
                    symbol=asset.symbol,
                )
                market_price, created = MarketPrice.objects.update_or_create(
                    asset=asset,
                    currency=currency,
                    date=price_date,
                    defaults={
                        "price": price,
                        "source": self.SOURCE,
                    },
                )
                created_count += int(created)
                updated_count += int(not created)
                saved_prices.append(market_price)

        return {
            "created": created_count,
            "updated": updated_count,
            "prices": saved_prices,
            "quota": quota,
        }

    def _request_latest(self, currency, symbols):
        query = urlencode({
            "base": currency,
            "currencies": ",".join(symbols),
        })
        request = Request(
            f"{self.base_url}/latest?{query}",
            headers={
                "X-API-KEY": self.api_key,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "MarketDashboard/1.0",
            },
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw_body = response.read()
                quota = {
                    "current": response.headers.get("X-API-CURRENT"),
                    "limit": response.headers.get("X-API-QUOTA"),
                }
        except HTTPError as exc:
            payload = self._decode_error_body(exc)
            self._raise_api_error(payload, http_status=exc.code)
        except (TimeoutError, socket.timeout) as exc:
            raise MetalPriceTimeoutError(
                "MetalpriceAPI request timed out."
            ) from exc
        except URLError as exc:
            if isinstance(exc.reason, (TimeoutError, socket.timeout)):
                raise MetalPriceTimeoutError(
                    "MetalpriceAPI request timed out."
                ) from exc
            raise MetalPriceAPIError(
                "Could not connect to MetalpriceAPI."
            ) from exc

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise MetalPriceInvalidResponseError(
                "MetalpriceAPI returned invalid JSON."
            ) from exc

        if not isinstance(payload, dict):
            raise MetalPriceInvalidResponseError(
                "MetalpriceAPI returned an unexpected response."
            )

        if payload.get("success") is not True:
            self._raise_api_error(payload)

        return payload, quota

    def _extract_price(self, rates, currency, symbol):
        direct_key = f"{currency}{symbol}"
        raw_price = rates.get(direct_key)

        if raw_price is None:
            reciprocal_rate = rates.get(symbol)
            try:
                reciprocal = Decimal(str(reciprocal_rate))
                if reciprocal == 0:
                    raise InvalidOperation
                raw_price = Decimal("1") / reciprocal
            except (InvalidOperation, TypeError, ValueError):
                raise MetalPriceInvalidResponseError(
                    f"No valid price was returned for {symbol}."
                )

        try:
            price = Decimal(str(raw_price))
            if not price.is_finite() or price <= 0:
                raise InvalidOperation
            return price.quantize(self.PRICE_PLACES)
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise MetalPriceInvalidResponseError(
                f"Invalid price returned for {symbol}."
            ) from exc

    def _response_date(self, payload):
        timestamp = payload.get("timestamp")
        try:
            return datetime.fromtimestamp(
                int(timestamp),
                tz=timezone.utc,
            ).date()
        except (TypeError, ValueError, OSError, OverflowError) as exc:
            raise MetalPriceInvalidResponseError(
                "MetalpriceAPI returned an invalid timestamp."
            ) from exc

    def _decode_error_body(self, error):
        try:
            return json.loads(error.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}

    def _raise_api_error(self, payload, http_status=None):
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        if not isinstance(error, dict):
            error = {}

        code = error.get("code")
        info = (
            error.get("info")
            or error.get("message")
            or payload.get("message")
            or payload.get("detail")
            or payload.get("info")
            or "MetalpriceAPI rejected the request."
        )

        if http_status == 429 or code in self.RATE_LIMIT_CODES:
            raise MetalPriceRateLimitError(info)

        if http_status:
            info = f"{info} (HTTP {http_status})"

        raise MetalPriceAPIError(info)
