"""Validate LAB 002 editorial artifacts and the clean WeChat fragment."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re


REQUIRED_ARTIFACTS = (
    "brief.yaml",
    "claims.yaml",
    "sources.yaml",
    "article.md",
    "fact-review.md",
    "editorial-review.yaml",
    "de-ai-report.md",
    "几张照片怎样接成一张_排版_石墨极简风(graphite-minimal).html",
)

REQUIRED_URLS = (
    "https://docs.opencv.org/4.13.0/d7/dff/tutorial_feature_homography.html",
    "https://docs.opencv.org/4.10.0/d0/d84/tutorial_js_usage.html",
    "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture",
    "https://www.pexels.com/legal-pages/license/",
    "https://www.pexels.com/video/camera-panning-over-mountains-9943097/",
    "https://www.pexels.com/video/panoramic-cityscape-of-modern-urban-skyline-36722864/",
    "https://www.pexels.com/video/panning-shot-of-ocean-6746361/",
)

FORBIDDEN_MEDIA_SUFFIXES = (".gif", ".mp4", ".webm")
FORBIDDEN_ANECDOTES = ("我曾", "我在现场", "我的朋友", "我的同事", "有人对我说")
FORBIDDEN_HTML = (
    "<style",
    "<script",
    "<div",
    " class=",
    " id=",
    "position:absolute",
    "position:fixed",
    "position:sticky",
    "display:grid",
    "@media",
    "@keyframes",
)


class _FragmentInspector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.errors: list[str] = []
        self.stack: list[tuple[str, dict[str, str | None]]] = []
        self.images: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attributes = dict(attrs)
        if tag == "img":
            source = attributes.get("src")
            if source:
                self.images.append(source)
        if tag in {"br", "img", "hr", "meta", "link", "input"}:
            return
        self.stack.append((tag, attributes))

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        self.handle_starttag(tag, attrs)
        self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        if not self.stack:
            self.errors.append(f"unexpected closing tag </{tag}>")
            return
        opened, _ = self.stack.pop()
        if opened != tag:
            self.errors.append(f"mismatched HTML tags: <{opened}> then </{tag}>")

    def handle_data(self, data: str) -> None:
        if not data.strip():
            return
        if not self.stack:
            self.errors.append("text exists outside the global section")
            return
        tag, attributes = self.stack[-1]
        if tag != "span" or "leaf" not in attributes:
            self.errors.append(f"text is not wrapped by span leaf: {data.strip()[:30]}")


def _relative_local_image(article_root: Path, source: str) -> Path | None:
    if re.match(r"^(?:https?:|data:)", source, flags=re.IGNORECASE):
        return None
    clean = source.split("#", 1)[0].split("?", 1)[0]
    return (article_root / clean).resolve()


def validate_article(lab_root: Path) -> list[str]:
    """Return deterministic editorial/publication errors without writing files."""

    lab_root = Path(lab_root).resolve()
    article_root = lab_root / "article"
    errors: list[str] = []
    for name in REQUIRED_ARTIFACTS:
        if not (article_root / name).is_file():
            errors.append(f"missing article artifact: {name}")
    if errors:
        return errors

    brief = (article_root / "brief.yaml").read_text("utf-8")
    claims = (article_root / "claims.yaml").read_text("utf-8")
    sources = (article_root / "sources.yaml").read_text("utf-8")
    markdown = (article_root / "article.md").read_text("utf-8")
    review = (article_root / "editorial-review.yaml").read_text("utf-8")
    de_ai = (article_root / "de-ai-report.md").read_text("utf-8")
    html_path = article_root / REQUIRED_ARTIFACTS[-1]
    html = html_path.read_text("utf-8")

    for field in (
        "audience:",
        "question:",
        "takeaway:",
        "action:",
        "thesis:",
        "novelty:",
        "boundary:",
        "counterpoint:",
        "sections:",
        "personal_materials:",
        "available: false",
    ):
        if field not in brief:
            errors.append(f"brief lacks required field: {field}")

    if "status: unsupported" in claims:
        errors.append("unsupported claim may not enter the article release")
    if "type: user_experience" in claims:
        errors.append("personal experience claim is forbidden without user material")
    if "source_ids: []" in claims and "type: opinion" not in claims:
        errors.append("non-opinion claims must cite direct source IDs")

    for url in REQUIRED_URLS:
        if url not in sources:
            errors.append(f"sources ledger lacks required URL: {url}")
    for source_id in (
        "opencv-homography",
        "opencv-js",
        "mdn-capture",
        "pexels-license",
        "pexels-mountains",
        "pexels-city",
        "pexels-ocean",
        "repo-asset-manifest",
        "repo-figure-manifest",
        "repo-ocean-diagnostic",
        "repo-contracts",
        "repo-privacy-tests",
    ):
        if f"id: {source_id}" not in sources:
            errors.append(f"sources ledger lacks source ID: {source_id}")

    if not markdown.startswith("---") or "# 几张照片，怎样接成一张？" not in markdown:
        errors.append("article lacks final title/frontmatter")
    for required in (
        "先找到同一个地方，再决定谁覆盖谁",
        "PENDING_DEVICE_CAPTURE",
        "完整三帧海面序列",
        "9 组",
        "INSUFFICIENT_OVERLAP",
        "https://hub-fover.github.io/Vision-Hu13/lab-002/",
        "https://github.com/hub-fover/Vision-Hu13",
    ):
        if required not in markdown:
            errors.append(f"article lacks required bounded statement: {required}")
    if "发布状态：可发布" not in markdown:
        errors.append("article must state its formal publication status")
    for marker in FORBIDDEN_ANECDOTES:
        if marker in markdown:
            errors.append(f"article contains unsupported personal anecdote: {marker}")
    if any(suffix in markdown.lower() for suffix in FORBIDDEN_MEDIA_SUFFIXES):
        errors.append("article may not reference fake/pending public device media")

    markdown_images = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", markdown)
    expected_figures = {
        f"../docs/figures/{number:02d}-{slug}.png"
        for number, slug in (
            (1, "overlap"),
            (2, "orb"),
            (3, "candidate-matches"),
            (4, "ratio-filter"),
            (5, "ransac"),
            (6, "transformed-canvas"),
            (7, "middle-anchor"),
            (8, "exposure"),
            (9, "feather"),
            (10, "failure-boundaries"),
        )
    }
    if not expected_figures.issubset(set(markdown_images)):
        errors.append("article must include all 10 real-input technical figures")
    if not any("../assets/samples/" in source for source in markdown_images):
        errors.append("article must include at least one committed real frame")
    for source in markdown_images:
        candidate = _relative_local_image(article_root, source)
        if candidate is not None:
            try:
                candidate.relative_to(lab_root)
            except ValueError:
                errors.append(f"article image escapes LAB root: {source}")
            else:
                if not candidate.is_file():
                    errors.append(f"article image is missing: {source}")

    if "publishable: true" not in review or "decision: pass" not in review:
        errors.append("editorial review has not passed")
    if "remaining_findings: []" not in de_ai:
        errors.append("de-AI report must record its remaining scan result")

    lowered = html.lower()
    for forbidden in FORBIDDEN_HTML:
        if forbidden in lowered:
            errors.append(f"WeChat HTML contains forbidden pattern: {forbidden}")
    if not html.lstrip().startswith("<section") or not html.rstrip().endswith(
        "</section>"
    ):
        errors.append("clean WeChat artifact must be one section fragment")
    for required_style in ("max-width:677px", "font-size:15px", "line-height:1.8"):
        if required_style not in html:
            errors.append(f"WeChat HTML lacks required style: {required_style}")
    if any(suffix in lowered for suffix in FORBIDDEN_MEDIA_SUFFIXES):
        errors.append("WeChat HTML may not reference pending device media")

    inspector = _FragmentInspector()
    try:
        inspector.feed(html)
        inspector.close()
    except Exception as exc:  # pragma: no cover - defensive parser boundary
        errors.append(f"WeChat HTML cannot be parsed: {exc}")
    errors.extend(inspector.errors)
    for source in inspector.images:
        candidate = _relative_local_image(article_root, source)
        if candidate is not None and not candidate.is_file():
            errors.append(f"WeChat image is missing: {source}")

    return errors


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("lab_root", nargs="?", default=Path(__file__).parents[1])
    args = parser.parse_args()
    problems = validate_article(Path(args.lab_root))
    if problems:
        raise SystemExit("\n".join(f"- {problem}" for problem in problems))
    print("LAB 002 article release: PASS")
