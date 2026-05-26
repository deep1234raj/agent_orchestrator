"""Static price table for LLM usage.

Prices are in USD per million tokens, separated by input and output.
Updating this table is the only thing required to support a new model
for cost tracking. Numbers are kept in one place rather than fetched
from a billing API — billing APIs are slow, rate-limited, and not
strictly necessary for in-app accounting.

Update prices manually when providers change them. The system tolerates
unknown models by charging $0 rather than failing — the cost meter just
under-reports, which is the safer failure mode.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Price:
    """USD per million tokens."""

    input_per_million: float
    output_per_million: float


# (provider, model) -> Price
PRICES: dict[tuple[str, str], Price] = {
    # Anthropic — Claude family
    ("anthropic", "claude-sonnet-4-5"): Price(3.00, 15.00),
    ("anthropic", "claude-opus-4-1"): Price(15.00, 75.00),
    ("anthropic", "claude-haiku-4-5"): Price(1.00, 5.00),
    # OpenAI — common SKUs
    ("openai", "gpt-4o"): Price(2.50, 10.00),
    ("openai", "gpt-4o-mini"): Price(0.15, 0.60),
}


def compute_cost_usd(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    """Return the cost of a single LLM call. Unknown models return 0."""
    price = PRICES.get((provider, model))
    if price is None:
        return 0.0
    return (
        input_tokens * price.input_per_million / 1_000_000
        + output_tokens * price.output_per_million / 1_000_000
    )
