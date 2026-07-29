"""Validate the constrained HTML fragment used for WeChat paste."""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path


FORBIDDEN_TAGS = {"script", "style", "div", "html", "head", "body"}
FORBIDDEN_ATTRIBUTES = {"class", "id"}
FORBIDDEN_STYLE_PATTERNS = (
    "position:",
    "float:",
    "display:grid",
    "display: grid",
    "@media",
    "@keyframes",
    "var(",
)


class FragmentValidator(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.errors: list[str] = []
        self.stack: list[str] = []
        self.root_tags: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if not self.stack:
            self.root_tags.append(tag)
        if tag in FORBIDDEN_TAGS:
            self.errors.append(f"forbidden tag <{tag}>")
        attributes = {name.lower(): value or "" for name, value in attrs}
        for name in FORBIDDEN_ATTRIBUTES & attributes.keys():
            self.errors.append(f"forbidden attribute {name} on <{tag}>")
        style = attributes.get("style", "").lower().replace(" ", "")
        for pattern in FORBIDDEN_STYLE_PATTERNS:
            if pattern.replace(" ", "") in style:
                self.errors.append(f"forbidden style {pattern} on <{tag}>")
        self.stack.append(tag)

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        self.handle_starttag(tag, attrs)
        self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        if self.stack:
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        if not data.strip():
            return
        if not self.stack:
            self.errors.append(f"text outside root: {data[:24]!r}")
            return
        if self.stack[-1] != "span":
            self.errors.append(
                f"text must be wrapped by <span leaf>: {data.strip()[:24]!r}"
            )


def validate(path: Path) -> list[str]:
    source = path.read_text(encoding="utf-8")
    parser = FragmentValidator()
    parser.feed(source)
    errors = parser.errors
    if parser.root_tags != ["section"]:
        errors.append(f"expected one <section> root, got {parser.root_tags}")
    for match in re.finditer(r"<span\b([^>]*)>", source, flags=re.IGNORECASE):
        attributes = match.group(1)
        if "leaf" not in attributes.lower():
            # Styling spans may wrap a leaf span; only spans with direct text are required
            tail = source[match.end() : source.find("</span>", match.end())]
            if re.match(r"\s*[^<\s]", tail):
                errors.append("text-bearing span is missing leaf attribute")
    return errors


def main(argv: list[str] | None = None) -> int:
    arguments = argv or sys.argv[1:]
    if len(arguments) != 1:
        print("usage: validate_article_html.py <fragment.html>")
        return 2
    errors = validate(Path(arguments[0]))
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("OK: 0 errors, 0 warnings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

