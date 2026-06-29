import json
import socket
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from django.test import TestCase, override_settings

from .models import Asset, MarketPrice
from .services import (
    MetalPriceInvalidResponseError,
    MetalPriceRateLimitError,
    MetalPriceService,
    MetalPriceTimeoutError,
)


@override_settings(
    METAL_PRICE_API_KEY="test-key",
    METAL_PRICE_API_BASE_URL="https://example.test/v1",
    METAL_PRICE_API_TIMEOUT=3,
)
class MetalPriceServiceTests(TestCase):
    def setUp(self):
        self.gold = Asset.objects.create(symbol="XAU", name="Gold")
        self.silver = Asset.objects.create(symbol="XAG", name="Silver")

    @patch("analytics.services.metal_price.urlopen")
    def test_refresh_creates_decimal_prices(self, mocked_urlopen):
        timestamp = 1782345600
        response = self._response({
            "success": True,
            "base": "USD",
            "timestamp": timestamp,
            "rates": {
                "USDXAU": 3350.123456,
                "XAG": 0.025,
            },
        })
        mocked_urlopen.return_value.__enter__.return_value = response

        result = MetalPriceService().refresh_latest_prices()

        self.assertEqual(result["created"], 2)
        self.assertEqual(result["updated"], 0)
        request = mocked_urlopen.call_args.args[0]
        self.assertEqual(request.get_header("X-api-key"), "test-key")
        self.assertEqual(
            request.get_header("User-agent"),
            "MarketDashboard/1.0",
        )
        self.assertEqual(
            MarketPrice.objects.get(asset=self.gold).price,
            Decimal("3350.1235"),
        )
        self.assertEqual(
            MarketPrice.objects.get(asset=self.silver).price,
            Decimal("40.0000"),
        )
        expected_date = datetime.fromtimestamp(
            timestamp,
            tz=timezone.utc,
        ).date()
        self.assertEqual(
            MarketPrice.objects.get(asset=self.gold).date,
            expected_date,
        )

    @patch("analytics.services.metal_price.urlopen")
    def test_refresh_updates_existing_daily_price(self, mocked_urlopen):
        response = self._response({
            "success": True,
            "timestamp": 1782345600,
            "rates": {"USDXAU": "3400", "USDXAG": "42"},
        })
        mocked_urlopen.return_value.__enter__.return_value = response

        service = MetalPriceService()
        service.refresh_latest_prices()
        second_result = service.refresh_latest_prices()

        self.assertEqual(second_result["created"], 0)
        self.assertEqual(second_result["updated"], 2)
        self.assertEqual(MarketPrice.objects.count(), 2)

    @patch("analytics.services.metal_price.urlopen")
    def test_invalid_json_is_rejected(self, mocked_urlopen):
        response = MagicMock()
        response.read.return_value = b"not-json"
        response.headers = {}
        mocked_urlopen.return_value.__enter__.return_value = response

        with self.assertRaises(MetalPriceInvalidResponseError):
            MetalPriceService().refresh_latest_prices()

    @patch(
        "analytics.services.metal_price.urlopen",
        side_effect=socket.timeout,
    )
    def test_timeout_has_specific_error(self, mocked_urlopen):
        with self.assertRaises(MetalPriceTimeoutError):
            MetalPriceService().refresh_latest_prices()

    @patch("analytics.services.metal_price.urlopen")
    def test_api_quota_error_has_specific_error(self, mocked_urlopen):
        response = self._response({
            "success": False,
            "error": {
                "code": 104,
                "info": "Monthly usage limit reached.",
            },
        })
        mocked_urlopen.return_value.__enter__.return_value = response

        with self.assertRaises(MetalPriceRateLimitError):
            MetalPriceService().refresh_latest_prices()

    @patch("analytics.services.metal_price.urlopen")
    def test_api_quota_message_has_specific_error(self, mocked_urlopen):
        response = self._response({
            "success": False,
            "message": "The free monthly quota has been reached.",
        })
        mocked_urlopen.return_value.__enter__.return_value = response

        with self.assertRaises(MetalPriceRateLimitError):
            MetalPriceService().refresh_latest_prices()

    @patch("analytics.services.metal_price.urlopen")
    def test_api_request_allowance_message_has_specific_error(
        self,
        mocked_urlopen,
    ):
        response = self._response({
            "success": False,
            "message": (
                "User has reached or exceeded the monthly API request "
                "allowance for their subscription plan."
            ),
        })
        mocked_urlopen.return_value.__enter__.return_value = response

        with self.assertRaises(MetalPriceRateLimitError):
            MetalPriceService().refresh_latest_prices()

    @patch("analytics.services.metal_price.urlopen")
    def test_http_error_includes_provider_message_and_status(
        self,
        mocked_urlopen,
    ):
        body = BytesIO(json.dumps({
            "message": "Invalid authentication credentials.",
        }).encode("utf-8"))
        mocked_urlopen.side_effect = HTTPError(
            url="https://example.test/v1/latest",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=body,
        )

        with self.assertRaisesRegex(
            Exception,
            r"Invalid authentication credentials\. \(HTTP 401\)",
        ):
            MetalPriceService().refresh_latest_prices()

    def _response(self, payload):
        response = MagicMock()
        response.read.return_value = json.dumps(payload).encode("utf-8")
        response.headers = {
            "X-API-CURRENT": "7",
            "X-API-QUOTA": "100",
        }
        return response


class MarketComparisonViewTests(TestCase):
    def setUp(self):
        self.gold = Asset.objects.create(symbol="XAU", name="Gold")
        self.silver = Asset.objects.create(symbol="XAG", name="Silver")
        self.platinum = Asset.objects.create(symbol="XPT", name="Platinum")
        today = datetime.now(timezone.utc).date()

        MarketPrice.objects.create(
            asset=self.gold,
            currency="USD",
            price=Decimal("1000.0000"),
            date=today - timedelta(days=5),
        )
        MarketPrice.objects.create(
            asset=self.gold,
            currency="USD",
            price=Decimal("1100.0000"),
            date=today,
        )
        MarketPrice.objects.create(
            asset=self.silver,
            currency="USD",
            price=Decimal("20.0000"),
            date=today - timedelta(days=5),
        )
        MarketPrice.objects.create(
            asset=self.silver,
            currency="USD",
            price=Decimal("18.0000"),
            date=today,
        )
        MarketPrice.objects.create(
            asset=self.platinum,
            currency="EUR",
            price=Decimal("900.0000"),
            date=today,
        )

    def test_market_comparison_returns_summaries_and_history(self):
        response = self.client.get(
            "/analytics/market-comparison/",
            {"symbols": "XAU,XAG", "days": "10", "currency": "usd"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["currency"], "USD")
        self.assertEqual(data["days"], 10)
        self.assertEqual(
            [asset["symbol"] for asset in data["assets"]],
            ["XAG", "XAU"],
        )

        silver = data["assets"][0]
        gold = data["assets"][1]

        self.assertEqual(Decimal(str(gold["change_percent"])), Decimal("10.0"))
        self.assertEqual(Decimal(str(silver["change_percent"])), Decimal("-10.0"))
        self.assertEqual(len(gold["prices"]), 2)
        self.assertEqual(
            Decimal(str(gold["prices"][-1]["normalized_price"])),
            Decimal("110.0"),
        )

    def test_market_comparison_rejects_invalid_days(self):
        response = self.client.get(
            "/analytics/market-comparison/",
            {"days": "soon"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "days must be a valid number.")


class InsightsViewTests(TestCase):
    def setUp(self):
        self.gold = Asset.objects.create(symbol="XAU", name="Gold")
        self.silver = Asset.objects.create(symbol="XAG", name="Silver")
        today = datetime.now(timezone.utc).date()

        MarketPrice.objects.create(
            asset=self.gold,
            currency="USD",
            price=Decimal("1000.0000"),
            date=today - timedelta(days=5),
        )
        MarketPrice.objects.create(
            asset=self.gold,
            currency="USD",
            price=Decimal("1120.0000"),
            date=today,
        )
        MarketPrice.objects.create(
            asset=self.silver,
            currency="USD",
            price=Decimal("20.0000"),
            date=today - timedelta(days=5),
        )
        MarketPrice.objects.create(
            asset=self.silver,
            currency="USD",
            price=Decimal("18.0000"),
            date=today,
        )

    def test_insights_are_generated_from_market_history(self):
        response = self.client.get(
            "/analytics/insights/",
            {"days": "10", "currency": "USD"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["currency"], "USD")
        self.assertEqual(data["days"], 10)
        self.assertTrue(data["generated"])
        self.assertIn(
            "Gold outperformed Silver",
            [insight["title"] for insight in data["generated"]],
        )
        self.assertIn(
            "Silver recorded the largest decline",
            [insight["title"] for insight in data["generated"]],
        )

    def test_insights_reject_invalid_days(self):
        response = self.client.get(
            "/analytics/insights/",
            {"days": "many"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "days must be a valid number.")


class RefreshMarketDataViewPermissionTests(TestCase):
    @override_settings(DEBUG=True)
    @patch("analytics.views.MetalPriceService")
    def test_refresh_is_available_in_local_debug(
        self,
        mocked_service_class,
    ):
        service = mocked_service_class.return_value
        service.refresh_latest_prices.return_value = {
            "created": 0,
            "updated": 0,
            "prices": [],
            "quota": {"current": None, "limit": None},
        }

        response = self.client.post(
            "/analytics/refresh/",
            data={"currency": "USD", "symbols": []},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)

    @override_settings(DEBUG=False)
    def test_refresh_requires_admin_outside_debug(self):
        response = self.client.post(
            "/analytics/refresh/",
            data={"currency": "USD", "symbols": []},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
