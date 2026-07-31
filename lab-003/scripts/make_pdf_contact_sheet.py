from pathlib import Path

from PIL import Image, ImageOps


root = Path(__file__).resolve().parents[1] / "tmp" / "pdfs"
pages = [Image.open(path).convert("RGB") for path in sorted(root.glob("review-*.jpg"))]
thumbs = []
for page in pages:
    page.thumbnail((420, 594), Image.Resampling.LANCZOS)
    thumbs.append(ImageOps.expand(page, border=2, fill="#8a8c87"))
rows = (len(thumbs) + 2) // 3
sheet = Image.new("RGB", (3 * 440, rows * 614), "#d9dad6")
for index, page in enumerate(thumbs):
    sheet.paste(page, (10 + index % 3 * 440, 10 + index // 3 * 614))
sheet.save(root / "review-contact-sheet.jpg", quality=90)
