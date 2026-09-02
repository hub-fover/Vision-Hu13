"""Portable, actionable failures for the panorama pipeline."""

from __future__ import annotations

from collections.abc import Sequence

from .contracts import ERROR_CODES


class StitchError(RuntimeError):
    """A pipeline failure carrying one of the shared cross-runtime codes."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        pair_index: int | None = None,
        pair_names: Sequence[str] | None = None,
    ) -> None:
        if code not in ERROR_CODES:
            raise ValueError(f"unknown panorama error code: {code}")
        self.code = code
        self.message = message
        self.pair_index = pair_index
        self.pair_names = tuple(pair_names) if pair_names is not None else None
        super().__init__(self._format_message())

    def _format_message(self) -> str:
        if self.pair_index is None:
            return f"[{self.code}] {self.message}"
        pair = f"pair {self.pair_index + 1}"
        if self.pair_names and len(self.pair_names) == 2:
            pair += f" ({self.pair_names[0]} -> {self.pair_names[1]})"
        return f"[{self.code}] {pair}: {self.message}"
