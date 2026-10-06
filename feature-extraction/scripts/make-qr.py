"""Generate a scannable QR for the public teaching LAB (not AI artwork)."""
from pathlib import Path
import qrcode
from PIL import Image

URL = "https://hub-fover.github.io/Vision-Hu13/feature-extraction/"
root = Path(__file__).resolve().parents[1]
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,
                   box_size=12, border=4)
qr.add_data(URL)
qr.make(fit=True)
image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
image.save(root / "web" / "feature-extraction-qr.png")
print(URL)
print(root / "web" / "feature-extraction-qr.png")
