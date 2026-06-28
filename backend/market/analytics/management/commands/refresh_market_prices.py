from django.core.management.base import BaseCommand, CommandError

from analytics.services import MetalPriceAPIError, MetalPriceService


class Command(BaseCommand):
    help = "Refresh latest market prices."

    def add_arguments(self, parser):
        parser.add_argument("--currency", default="USD")
        parser.add_argument(
            "--symbols",
            nargs="*",
            help="Optional asset symbols to refresh, such as XAU XAG.",
        )
        parser.add_argument(
            "--backfill-days",
            type=int,
            help="Backfill historical prices instead of refreshing latest prices.",
        )

    def handle(self, *args, **options):
        currency = options["currency"]
        symbols = options.get("symbols")
        backfill_days = options.get("backfill_days")

        service = MetalPriceService()

        if backfill_days:
            try:
                result = service.backfill_historical_prices(
                    currency=currency,
                    symbols=symbols,
                    days=backfill_days,
                )
            except MetalPriceAPIError as exc:
                raise CommandError(str(exc)) from exc

            self.stdout.write(
                self.style.SUCCESS(
                    f"Backfilled market prices: "
                    f"{result['created']} created, {result['updated']} updated "
                    f"from {result['start_date']} to {result['end_date']}."
                )
            )
            return

        try:
            result = service.refresh_latest_prices(
                currency=currency,
                symbols=symbols,
            )
        except MetalPriceAPIError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Refreshed market prices: "
                f"{result['created']} created, {result['updated']} updated."
            )
        )
