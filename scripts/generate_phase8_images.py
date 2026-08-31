#!/usr/bin/env python3
"""Crop photos, render diagrams, and emit JPEG/PNG + WebP + AVIF variants."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SESSION_IMAGES = Path(
    "/home/kunalsiyag/.grok/sessions/"
    "%2Fhome%2Fkunalsiyag%2FProjects%2Fupi-qr/"
    "01a0446c-8967-7ee2-b6b7-e3361064661f/images"
)
DIAGRAM_DIR = ROOT / "scripts" / "diagrams"
FONT_DIR = Path("/home/kunalsiyag/.local/share/fonts/extras/ttf")
W, H = 1200, 630
CHROME = "google-chrome"

PHOTO_MAP = {
    "13.jpg": "kirana-upi-standee.jpg",
    "6.jpg": "google-pay-merchant-phone.jpg",
    "7.jpg": "bhim-navy-upi-poster.jpg",
    "12.jpg": "bank-account-upi-qr-desk.jpg",
    "11.jpg": "universal-qr-wifi-vcard.jpg",
    "9.jpg": "upi-payment-failed-phone.jpg",
    "8.jpg": "whatsapp-upi-payment-share.jpg",
    "10.jpg": "temple-donation-upi-box.jpg",
    "16.jpg": "freelancer-invoice-laptop-qr.jpg",
    "15.jpg": "restaurant-table-tent-qr.jpg",
    "17.jpg": "html-website-upi-qr.jpg",
    "14.jpg": "international-upi-travel.jpg",
    "18.jpg": "pending-upi-sms-phone.jpg",
    "19.jpg": "qr-tampering-overlay-sticker.jpg",
}

EXISTING_BLOG = [
    "phonepe-business-qr-activation.jpg",
    "phonepe-virtual-qr-on-phone.jpg",
    "print-upi-qr-sizes.jpg",
    "upi-qr-sticker-sheet.jpg",
    "upi-soundbox-tea-stall.jpg",
]

TEMPLATE_FILES = [
    "abc-shop-standee.png",
    "abc-temple-donation.png",
    "abc-restaurant-table.png",
    "abc-freelancer-card.png",
    "abc-event-ticket.png",
    "abc-custom-minimal.png",
    "abc-taxi-cab.png",
]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def crop_og_safe(im: Image.Image, width: int = W, height: int = H) -> Image.Image:
    """Center-crop, preferring to drop the bottom-right watermark strip."""
    im = im.convert("RGB")
    src_w, src_h = im.size
    scale = max(width / src_w, height / src_h)
    resized = im.resize((round(src_w * scale), round(src_h * scale)), Image.Resampling.LANCZOS)
    rw, rh = resized.size
    left = max(0, (rw - width) // 2)
    top = max(0, min((rh - height) // 3, rh - height))  # bias up, drop watermark
    return resized.crop((left, top, left + width, top + height))


def save_variants(im: Image.Image, dest: Path, jpeg_quality: int = 86) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    suffix = dest.suffix.lower()
    base = dest.with_suffix("")
    rgb = im.convert("RGB") if im.mode != "RGB" else im

    if suffix in {".jpg", ".jpeg"}:
        rgb.save(dest, "JPEG", quality=jpeg_quality, optimize=True, progressive=True)
        canonical = dest
    elif suffix == ".png":
        im.save(dest, "PNG", optimize=True)
        canonical = dest
    else:
        raise ValueError(dest)

    for width in (1200, 800, 480):
        scaled = rgb if width == rgb.size[0] else ImageOps.contain(rgb, (width, 10_000), Image.Resampling.LANCZOS)
        webp_path = Path(f"{base}-{width}.webp") if width != 1200 else Path(f"{base}.webp")
        avif_path = Path(f"{base}-{width}.avif") if width != 1200 else Path(f"{base}.avif")
        scaled.save(webp_path, "WEBP", quality=78, method=6)
        scaled.save(avif_path, "AVIF", quality=52)
    print(f"  wrote {canonical.relative_to(ROOT)} {rgb.size}")


def make_og(photo: Image.Image, dest: Path) -> None:
    canvas = photo.copy().convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    bar_top = H - 168
    draw.rectangle((0, bar_top, W, H), fill=(17, 59, 44, 230))
    draw.rectangle((0, bar_top, 12, H), fill=(248, 184, 78, 255))
    title = font("Inter-Black.ttf", 44)
    sub = font("Inter-SemiBold.ttf", 22)
    draw.text((36, bar_top + 28), "Pro UPI QR", font=title, fill=(255, 250, 241, 255))
    draw.text((36, bar_top + 92), "Free UPI QR code generator for shops and bank accounts", font=sub, fill=(223, 246, 231, 255))
    out = Image.alpha_composite(canvas, overlay).convert("RGB")
    save_variants(out, dest)


def html_shell(body: str, width: int = W, height: int = H) -> str:
    inter_reg = FONT_DIR / "Inter-Regular.ttf"
    inter_sb = FONT_DIR / "Inter-SemiBold.ttf"
    inter_blk = FONT_DIR / "Inter-Black.ttf"
    inter_mono = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
    qr = (DIAGRAM_DIR / "demo-qr.png").as_uri()
    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<style>
@font-face {{ font-family: Inter; src: url('{inter_reg.as_uri()}'); font-weight: 400; }}
@font-face {{ font-family: Inter; src: url('{inter_sb.as_uri()}'); font-weight: 600; }}
@font-face {{ font-family: Inter; src: url('{inter_blk.as_uri()}'); font-weight: 900; }}
@font-face {{ font-family: Mono; src: url('file://{inter_mono}'); font-weight: 400; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: {width}px; height: {height}px; overflow: hidden; background: #fffaf1; color: #113b2c; font-family: Inter, sans-serif; }}
.page {{ width: {width}px; height: {height}px; padding: 36px 40px; background: linear-gradient(180deg, #fffaf1 0%, #f4efe0 100%); }}
.kicker {{ font-size: 13px; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; color: #287a57; }}
h1 {{ font-size: 34px; font-weight: 900; letter-spacing: -0.03em; margin: 8px 0 22px; }}
.grid {{ display: grid; gap: 14px; }}
.card {{ background: #fff; border: 1px solid rgba(17,59,44,0.1); border-radius: 18px; padding: 16px 18px; }}
.muted {{ color: rgba(17,59,44,0.68); font-size: 14px; line-height: 1.45; }}
.tag {{ display: inline-block; background: #dff6e7; color: #113b2c; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 10px; }}
table {{ width: 100%; border-collapse: collapse; font-size: 15px; }}
th, td {{ text-align: left; padding: 9px 10px; border-bottom: 1px solid rgba(17,59,44,0.1); }}
th {{ font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #287a57; }}
.mono {{ font-family: Mono, monospace; font-size: 15px; }}
.qr {{ width: 132px; height: 132px; background: #fff; border-radius: 12px; }}
.foot {{ position: absolute; bottom: 22px; right: 40px; font-size: 12px; font-weight: 600; color: rgba(17,59,44,0.5); }}
</style></head><body>
{body}
<img src="{qr}" alt="" style="display:none">
</body></html>"""


def diagram_print_size() -> str:
    return html_shell("""
<div class="page">
  <p class="kicker">Print guide</p>
  <h1>UPI QR print sizes and scan distance</h1>
  <div class="grid" style="grid-template-columns: 1.25fr 0.75fr;">
    <div class="card">
      <table>
        <tr><th>Use</th><th>Minimum QR</th><th>Recommended</th></tr>
        <tr><td>Handheld, close scan</td><td>2 cm × 2 cm</td><td>3 cm × 3 cm</td></tr>
        <tr><td>Counter standee</td><td>3 cm × 3 cm</td><td>4–5 cm</td></tr>
        <tr><td>Wall / donation, 4–6 ft</td><td>5 cm × 5 cm</td><td>8–15 cm</td></tr>
        <tr><td>A6 table tent (4×6 in)</td><td>1.5 in QR</td><td>2 in QR</td></tr>
        <tr><td>A5 / 5×7 counter card</td><td>2 in QR</td><td>2.5 in QR</td></tr>
        <tr><td>A4 poster (210×297 mm)</td><td>3 in QR</td><td>3–4 in QR</td></tr>
      </table>
    </div>
    <div class="card">
      <p style="font-weight:900;margin-bottom:10px;">Rule of thumb</p>
      <p class="muted">Scan distance ÷ 10 ≈ minimum QR width in inches. A 5-foot counter needs about a <strong>2-inch (5 cm)</strong> QR. Print at <strong>300 DPI</strong> on <strong>matte</strong> stock. NPCI does not mandate one global print size.</p>
      <p class="tag" style="margin-top:14px;">Quiet zone: keep a white border</p>
    </div>
  </div>
  <p class="foot">proupiqr.in/print-templates/</p>
</div>""")


def diagram_uri() -> str:
    qr = (DIAGRAM_DIR / "demo-qr.png").as_uri()
    return html_shell(f"""
<div class="page">
  <p class="kicker">UPI payload</p>
  <h1>What a UPI QR actually encodes</h1>
  <div class="grid" style="grid-template-columns: 160px 1fr; align-items:center;">
    <img class="qr" src="{qr}" alt="Demo UPI QR">
    <div class="card mono" style="font-size:18px;line-height:1.7;">
      upi://pay?<span style="color:#287a57">pa</span>=demo@upi&amp;<span style="color:#287a57">pn</span>=Demo Shop&amp;<span style="color:#287a57">am</span>=250.00&amp;<span style="color:#287a57">cu</span>=INR&amp;<span style="color:#287a57">tn</span>=Bill
    </div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(5,1fr);margin-top:18px;">
    <div class="card"><p style="font-weight:900;">pa</p><p class="muted">Payee VPA / UPI ID</p></div>
    <div class="card"><p style="font-weight:900;">pn</p><p class="muted">Payee display name</p></div>
    <div class="card"><p style="font-weight:900;">am</p><p class="muted">Optional amount</p></div>
    <div class="card"><p style="font-weight:900;">cu</p><p class="muted">Currency, usually INR</p></div>
    <div class="card"><p style="font-weight:900;">tn</p><p class="muted">Optional note</p></div>
  </div>
  <p class="muted" style="margin-top:14px;">Demo payload only — not a live VPA. Any UPI app that reads <span class="mono">upi://pay</span> can open it. Official merchant kits from PhonePe or GPay are separate products.</p>
  <p class="foot">proupiqr.in</p>
</div>""")


def diagram_scan() -> str:
    return html_shell("""
<div class="page">
  <p class="kicker">Scan test</p>
  <h1>Proof-scan from 1 ft, 3 ft, and 5 ft</h1>
  <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:8px;">
    <div class="card" style="text-align:center;padding:28px 18px;">
      <div style="height:90px;display:flex;align-items:flex-end;justify-content:center;"><div style="width:54px;height:54px;background:#113b2c;border-radius:8px;"></div></div>
      <p style="font-weight:900;font-size:28px;margin:16px 0 4px;">1 ft</p>
      <p class="muted">Handheld / customer at the glass</p>
      <p class="tag" style="margin-top:12px;">QR ≥ 2–3 cm</p>
    </div>
    <div class="card" style="text-align:center;padding:28px 18px;">
      <div style="height:90px;display:flex;align-items:flex-end;justify-content:center;"><div style="width:78px;height:78px;background:#113b2c;border-radius:8px;"></div></div>
      <p style="font-weight:900;font-size:28px;margin:16px 0 4px;">3 ft</p>
      <p class="muted">Typical billing-counter distance</p>
      <p class="tag" style="margin-top:12px;">QR ≥ 4–5 cm</p>
    </div>
    <div class="card" style="text-align:center;padding:28px 18px;">
      <div style="height:90px;display:flex;align-items:flex-end;justify-content:center;"><div style="width:110px;height:110px;background:#113b2c;border-radius:8px;"></div></div>
      <p style="font-weight:900;font-size:28px;margin:16px 0 4px;">5 ft</p>
      <p class="muted">Queue, wall poster, donation box</p>
      <p class="tag" style="margin-top:12px;">QR ≥ 5 cm, ideally 8+</p>
    </div>
  </div>
  <p class="muted" style="margin-top:18px;">Test with PhonePe and Google Pay before you laminate. If it fails, enlarge the QR — do not expect customers to lean in.</p>
  <p class="foot">proupiqr.in/blog/upi-qr-code-size-dimensions-printing-guide/</p>
</div>""")


def diagram_png_pdf() -> str:
    return html_shell("""
<div class="page">
  <p class="kicker">File format</p>
  <h1>PNG vs PDF for a printed UPI QR</h1>
  <div class="grid" style="grid-template-columns:1fr 1fr;">
    <div class="card">
      <p class="tag">PNG</p>
      <p style="font-weight:900;font-size:22px;margin:10px 0;">Best for WhatsApp and inkjet</p>
      <ul class="muted" style="padding-left:18px;line-height:1.7;">
        <li>Raster pixels. Export at the physical size × 300 DPI.</li>
        <li>Fine for home printers and chat sharing.</li>
        <li>Do not stretch a small screenshot to A4.</li>
      </ul>
    </div>
    <div class="card">
      <p class="tag">PDF</p>
      <p style="font-weight:900;font-size:22px;margin:10px 0;">Safer print-shop master</p>
      <ul class="muted" style="padding-left:18px;line-height:1.7;">
        <li>Keeps page size (A4 / A5) without resampling.</li>
        <li>Better when a shop will reprint later.</li>
        <li>Still test-scan the first proof copy.</li>
      </ul>
    </div>
  </div>
  <p class="muted" style="margin-top:18px;">Pro UPI QR does not claim SVG or WebAssembly print engines. Use PNG or PDF from the browser download, then print at 300 DPI on matte stock.</p>
  <p class="foot">proupiqr.in/blog/upi-qr-png-vs-pdf-print-quality-guide/</p>
</div>""")


def diagram_compare() -> str:
    return html_shell("""
<div class="page" style="padding:28px 36px;">
  <p class="kicker">Merchant extras, not the rail</p>
  <h1 style="font-size:30px;margin-bottom:14px;">PhonePe vs Google Pay vs Paytm for a shop QR</h1>
  <div class="card" style="padding:8px 4px 4px;">
    <table>
      <tr><th></th><th>PhonePe Business</th><th>GPay for Business</th><th>Paytm for Business</th><th>Compatible print here</th></tr>
      <tr><td>Who can pay</td><td>Any UPI app</td><td>Any UPI app</td><td>Any UPI app</td><td>Any UPI app</td></tr>
      <tr><td>What you print</td><td>Official merchant QR after KYC</td><td>Official merchant QR after KYC</td><td>Official merchant QR after KYC</td><td>Your existing VPA as upi://pay</td></tr>
      <tr><td>Dashboard / soundbox</td><td>In-app extras, rented box</td><td>In-app extras, phone alerts</td><td>In-app extras, rented box</td><td>None — use bank SMS / passbook</td></tr>
      <tr><td>Bank-to-bank MDR</td><td colspan="4">0% on standard UPI. RuPay credit-card UPI above ₹2,000 may carry interchange.</td></tr>
    </table>
  </div>
  <p class="muted" style="margin-top:12px;">UPI is interoperable. Competing apps sell merchant extras around the same rail. Confirm current schemes inside each app.</p>
  <p class="foot">proupiqr.in/phonepe-vs-paytm-vs-gpay/</p>
</div>""")


def diagram_static_dynamic() -> str:
    return html_shell("""
<div class="page">
  <p class="kicker">QR types</p>
  <h1>Static vs dynamic UPI QR</h1>
  <div class="grid" style="grid-template-columns:1fr 1fr;">
    <div class="card">
      <p class="tag">Static</p>
      <p style="font-weight:900;font-size:22px;margin:8px 0;">One print, reuse forever</p>
      <p class="muted">Encodes pa + pn (and optional fixed am). Customer types the amount unless you baked it in. Change the VPA and you reprint. Fits counters, tables, donation boxes.</p>
    </div>
    <div class="card">
      <p class="tag">Dynamic</p>
      <p style="font-weight:900;font-size:22px;margin:8px 0;">New payload per bill</p>
      <p class="muted">Amount and note are unique each time — invoices, tickets, delivery. A hosted dynamic code can change destination without reprinting the sticker. Needs a live mapping, not only a PNG.</p>
    </div>
  </div>
  <p class="muted" style="margin-top:16px;">Both still use NPCI <span class="mono">upi://pay</span>. A static PNG is not a payment gateway. A dynamic campaign on this site is Clerk-owned and documented in the privacy policy.</p>
  <p class="foot">proupiqr.in/blog/static-vs-dynamic-upi-qr-code-difference/</p>
</div>""")


def diagram_stickers() -> str:
    def sheet(cols: int, rows: int, label: str) -> str:
        cells = "".join(
            '<div style="border:1px dashed rgba(17,59,44,0.25);border-radius:8px;background:#fff;height:100%;"></div>'
            for _ in range(cols * rows)
        )
        return f"""
        <div class="card" style="padding:14px;">
          <p style="font-weight:900;margin-bottom:10px;">{label}</p>
          <div style="display:grid;grid-template-columns:repeat({cols},1fr);grid-template-rows:repeat({rows},1fr);gap:8px;height:210px;background:#fffaf1;padding:8px;border-radius:12px;">
            {cells}
          </div>
        </div>"""

    return html_shell(f"""
<div class="page">
  <p class="kicker">A4 sticker sheets</p>
  <h1>4-up, 6-up, and 12-up layouts</h1>
  <div class="grid" style="grid-template-columns:repeat(3,1fr);">
    {sheet(2, 2, "4-up · large counter stickers")}
    {sheet(3, 2, "6-up · default shop sheet")}
    {sheet(4, 3, "12-up · packing / staff badges")}
  </div>
  <p class="muted" style="margin-top:14px;">A4 (210 × 297 mm). Leave a 2 mm quiet zone inside each sticker. Matte vinyl or paper + laminate. Generate at /qr-sticker-generator/.</p>
  <p class="foot">proupiqr.in/qr-sticker-generator/</p>
</div>""")


def diagram_formats() -> str:
    items = [
        ("A4", "210 × 297 mm", "Standee / donation poster"),
        ("A5", "148 × 210 mm", "Billing counter card"),
        ("5 × 7 in", "127 × 178 mm", "Acrylic insert"),
        ("Table tent", "folded A6", "Cafe / restaurant"),
        ("Counter card", "90 × 54-ish", "Freelancer / cab"),
        ("Sticker sheet", "A4 4/6/12", "Glass / packing"),
    ]
    cards = "".join(
        f'<div class="card" style="min-height:118px;"><p style="font-weight:900;font-size:22px;">{name}</p><p class="muted">{size}</p><p style="margin-top:8px;font-weight:600;">{use}</p></div>'
        for name, size, use in items
    )
    return html_shell(f"""
<div class="page">
  <p class="kicker">Printable templates</p>
  <h1>Choose a size before you send to print</h1>
  <div class="grid" style="grid-template-columns:repeat(3,1fr);">{cards}</div>
  <p class="foot">proupiqr.in/print-templates/</p>
</div>""")


def format_card(title: str, size: str, qr: str, notes: str, paper_w: int, paper_h: int) -> str:
    scale = min(220 / paper_w, 360 / paper_h)
    w, h = round(paper_w * scale), round(paper_h * scale)
    qr_uri = (DIAGRAM_DIR / "demo-qr.png").as_uri()
    return html_shell(f"""
<div class="page" style="display:grid;grid-template-columns:280px 1fr;gap:36px;align-items:center;">
  <div style="display:flex;justify-content:center;">
    <div style="width:{w}px;height:{h}px;background:#fff;border:1px solid rgba(17,59,44,0.15);border-radius:8px;box-shadow:0 18px 40px rgba(17,59,44,0.12);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;">
      <p style="font-size:11px;font-weight:900;letter-spacing:0.16em;color:#287a57;">SCAN TO PAY</p>
      <img src="{qr_uri}" alt="" style="width:{min(w,h)*0.48}px;height:{min(w,h)*0.48}px;">
      <p style="font-size:11px;font-weight:700;">Demo Shop</p>
    </div>
  </div>
  <div>
    <p class="kicker">Print format</p>
    <h1 style="font-size:40px;">{title}</h1>
    <p style="font-size:22px;font-weight:700;margin-bottom:12px;">{size}</p>
    <p class="muted" style="font-size:16px;max-width:34rem;">{notes}</p>
    <p class="tag" style="margin-top:16px;">Recommended QR {qr}</p>
  </div>
  <p class="foot">proupiqr.in/print-templates/</p>
</div>""")


def screenshot_html(html: str, dest: Path, width: int = W, height: int = H) -> None:
    html_path = DIAGRAM_DIR / f"{dest.stem}.html"
    html_path.write_text(html, encoding="utf-8")
    png_tmp = DIAGRAM_DIR / f"{dest.stem}-raw.png"
    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--window-size={width},{height}",
        f"--screenshot={png_tmp}",
        html_path.as_uri(),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    im = Image.open(png_tmp).convert("RGB")
    if im.size != (width, height):
        im = im.resize((width, height), Image.Resampling.LANCZOS)
    save_variants(im, dest)
    png_tmp.unlink(missing_ok=True)


def process_photos() -> None:
    blog = ROOT / "public" / "images" / "blog"
    for src_name, dest_name in PHOTO_MAP.items():
        src = SESSION_IMAGES / src_name
        if not src.exists():
            raise SystemExit(f"missing generated photo {src}")
        im = crop_og_safe(Image.open(src))
        save_variants(im, blog / dest_name)
    for name in EXISTING_BLOG:
        path = blog / name
        im = Image.open(path)
        if im.size != (W, H):
            im = crop_og_safe(im)
        save_variants(im.convert("RGB"), path)


def process_templates() -> None:
    folder = ROOT / "public" / "images" / "template"
    for name in TEMPLATE_FILES:
        src = folder / name
        im = Image.open(src).convert("RGBA")
        thumb = ImageOps.contain(im, (480, 720), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", thumb.size, (255, 250, 241, 255))
        canvas.alpha_composite(thumb)
        rgb = canvas.convert("RGB")
        rgb.save(folder / f"{src.stem}-480.webp", "WEBP", quality=76, method=6)
        rgb.save(folder / f"{src.stem}-480.avif", "AVIF", quality=50)
        print(f"  thumb {src.stem}-480.webp {rgb.size}")


def main() -> None:
    DIAGRAM_DIR.mkdir(parents=True, exist_ok=True)
    print("photos")
    process_photos()
    kirana = Image.open(ROOT / "public" / "images" / "blog" / "kirana-upi-standee.jpg")
    print("og-image")
    make_og(kirana, ROOT / "public" / "images" / "og-image.png")

    print("diagrams")
    diagrams = ROOT / "public" / "images" / "diagrams"
    screenshot_html(diagram_print_size(), diagrams / "print-size-chart.png")
    screenshot_html(diagram_uri(), diagrams / "upi-pay-uri-anatomy.png")
    screenshot_html(diagram_scan(), diagrams / "scan-distance-chart.png")
    screenshot_html(diagram_png_pdf(), diagrams / "png-vs-pdf-print.png")
    screenshot_html(diagram_compare(), diagrams / "phonepe-gpay-paytm-compare.png")
    screenshot_html(diagram_static_dynamic(), diagrams / "static-vs-dynamic-qr.png")
    screenshot_html(diagram_stickers(), diagrams / "sticker-sheet-layouts.png")
    screenshot_html(diagram_formats(), diagrams / "print-formats-overview.png")

    print("print formats")
    fmt = ROOT / "public" / "images" / "print-formats"
    screenshot_html(
        format_card("A4 standee", "210 × 297 mm", "3–4 in", "Full-page poster for acrylic T-stands and donation walls. 300 DPI, matte laminate.", 210, 297),
        fmt / "a4-standee.png",
    )
    screenshot_html(
        format_card("A5 counter card", "148 × 210 mm", "2–2.5 in", "Billing-desk card. Fits many acrylic holders. Keep a white quiet zone.", 148, 210),
        fmt / "a5-counter-card.png",
    )
    screenshot_html(
        format_card("5 × 7 inch insert", "127 × 178 mm", "2–2.5 in", "Common photo-frame and acrylic-standee insert. Print borderless or with a 3 mm bleed.", 127, 178),
        fmt / "five-by-seven.png",
    )
    screenshot_html(
        format_card("Table tent", "folded ~A6 / 4 × 6 in", "1.5–2 in", "Two-sided tent for cafe tables. Matte card stock so ceiling lights do not glare.", 102, 148),
        fmt / "table-tent.png",
    )
    screenshot_html(
        format_card("Counter / visiting card", "≈ 90 × 54 mm plus QR panel", "2 cm+", "Freelancer billing cards and cab dashboards. Large contrast, short payee name.", 90, 120),
        fmt / "counter-card.png",
    )
    screenshot_html(
        format_card("A4 sticker sheet", "210 × 297 mm · 4 / 6 / 12 up", "2.5–3 cm each", "Cut or kiss-cut stickers for glass counters and packing. Use the sticker-sheet tool.", 210, 297),
        fmt / "sticker-sheet.png",
    )

    print("template thumbs")
    process_templates()
    print("done")


if __name__ == "__main__":
    main()
