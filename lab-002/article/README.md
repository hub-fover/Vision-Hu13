# LAB 002 article

The reviewed WeChat article is **《几张照片，怎样接成一张？》**.

- `brief.yaml`, `claims.yaml`, and `sources.yaml` preserve the editorial
  question, evidence boundaries, and direct source IDs.
- `article.md` is the reviewed Markdown source.
- `fact-review.md`, `editorial-review.yaml`, and `de-ai-report.md` record the
  factual and editorial checks.
- `几张照片怎样接成一张_排版_石墨极简风(graphite-minimal).html` is the clean
  677px WeChat fragment. The `_预览.html` sibling adds a local copy button
  outside that fragment.

The article contains only committed real frames and real-input algorithm
figures. Real Android/iPhone media remains `PENDING_DEVICE_CAPTURE`, so no
GIF, MP4, WebM, or simulated device recording is embedded.

Validate the release from `lab-002/`:

```powershell
python scripts/validate_article.py .
python C:\Users\biaoh\.codex\skills\gzh-design-skill\scripts\validate_gzh_html.py article\几张照片怎样接成一张_排版_石墨极简风(graphite-minimal).html
```
