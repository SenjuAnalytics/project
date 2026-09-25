import os
from PIL import Image, ImageDraw, ImageFont

def create_og_image():
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), (11, 14, 17, 255))
    draw = ImageDraw.Draw(img)

    # Ambient radial glow in top-left & center-right
    for r in range(400, 0, -5):
        alpha = int((1 - r / 400.0) * 35)
        draw.ellipse([600 - r, -100 - r, 600 + r, -100 + r], fill=(174, 212, 60, alpha))
        draw.ellipse([1100 - r, 300 - r, 1100 + r, 300 + r], fill=(14, 203, 129, alpha // 2))

    # Load fonts
    font_path_bold = "C:/Windows/Fonts/segoeuib.ttf"
    font_path_reg = "C:/Windows/Fonts/segoeui.ttf"
    font_path_semi = "C:/Windows/Fonts/seguisb.ttf" if os.path.exists("C:/Windows/Fonts/seguisb.ttf") else font_path_reg

    title_font = ImageFont.truetype(font_path_bold, 68)
    tagline_font = ImageFont.truetype(font_path_bold, 34)
    desc_font = ImageFont.truetype(font_path_reg, 22)
    badge_font = ImageFont.truetype(font_path_bold, 16)
    card_title_font = ImageFont.truetype(font_path_bold, 17)
    card_desc_font = ImageFont.truetype(font_path_reg, 13)
    domain_font = ImageFont.truetype(font_path_bold, 20)

    # Outer border
    draw.rounded_rectangle([20, 20, W - 20, H - 20], radius=16, outline=(42, 50, 42, 255), width=2)

    # Robinhood Badge Pill
    pill_x, pill_y = 60, 55
    pill_w, pill_h = 420, 42
    draw.rounded_rectangle([pill_x, pill_y, pill_x + pill_w, pill_y + pill_h], radius=21, fill=(24, 30, 24, 255), outline=(174, 212, 60, 100), width=1)
    
    # Load and paste Robinhood Logo
    rh_logo_path = "frontend/public/robinhood-logo-128.png"
    if os.path.exists(rh_logo_path):
        rh_logo = Image.open(rh_logo_path).convert("RGBA").resize((26, 26))
        img.paste(rh_logo, (pill_x + 12, pill_y + 8), rh_logo)

    # Green pulse dot
    draw.ellipse([pill_x + 48, pill_y + 17, pill_x + 56, pill_y + 25], fill=(14, 203, 129, 255))
    draw.text((pill_x + 66, pill_y + 11), "ROBINHOOD CHAIN  ·  CHAIN ID 4663", font=badge_font, fill=(234, 235, 230, 255))

    # Qualyra Wordmark & Accent
    draw.text((60, 125), "QUALYRA", font=title_font, fill=(245, 247, 242, 255))
    # Brand line
    draw.line([62, 208, 140, 208], fill=(174, 212, 60, 255), width=4)

    # Tagline
    draw.text((60, 230), "Launch. Prove. Battle.", font=tagline_font, fill=(174, 212, 60, 255))

    # Description
    desc_text = "The Premier Bonding Curve DEX, Real-World Asset (RWA) Vaults & PvP Battle Arena on Robinhood Chain."
    draw.text((60, 280), desc_text, font=desc_font, fill=(163, 168, 163, 255))

    # 4 Feature Cards at the bottom
    cards = [
        ("⚡ Bonding Curve DEX", "Instant liquidity & live pool pricing", (174, 212, 60)),
        ("🏦 Stock RWAs & CDP", "NVDA, AAPL, SPY with 150% MCR", (96, 165, 250)),
        ("🥊 PvP Battle Arena", "On-chain token volume showdowns", (245, 158, 11)),
        ("🛡️ VaultGuard Shield", "KPI-gated escrow & 100% LP burn", (16, 185, 129)),
    ]

    card_w = 252
    card_h = 100
    card_y = 350
    spacing = 24
    start_x = 60

    for i, (title, desc, color) in enumerate(cards):
        cx = start_x + i * (card_w + spacing)
        # Card Background
        draw.rounded_rectangle([cx, card_y, cx + card_w, card_y + card_h], radius=10, fill=(20, 24, 22, 255), outline=(48, 56, 48, 255), width=1)
        # Top accent bar on card
        draw.rounded_rectangle([cx, card_y, cx + card_w, card_y + 4], radius=2, fill=color)
        # Card Title
        draw.text((cx + 14, card_y + 18), title, font=card_title_font, fill=(240, 242, 240, 255))
        # Card Desc
        draw.text((cx + 14, card_y + 48), desc, font=card_desc_font, fill=(140, 148, 140, 255))

    # Bottom Footer Row
    draw.line([60, 480, W - 60, 480], fill=(35, 42, 35, 255), width=1)
    draw.text((60, 520), "Sub-Second Finality  ·  Sub-Cent Gas Fees  ·  Institutional Proof of Reserve", font=ImageFont.truetype(font_path_reg, 16), fill=(120, 128, 120, 255))

    # Official URL Pill at bottom right
    url_text = "www.qualyra.xyz"
    url_box_w = 220
    url_box_h = 44
    url_box_x = W - 60 - url_box_w
    url_box_y = 508
    draw.rounded_rectangle([url_box_x, url_box_y, url_box_x + url_box_w, url_box_y + url_box_h], radius=8, fill=(174, 212, 60, 30), outline=(174, 212, 60, 180), width=1)
    draw.text((url_box_x + 28, url_box_y + 11), url_text, font=domain_font, fill=(174, 212, 60, 255))

    # Convert to RGB and save
    final_img = img.convert("RGB")
    out_path = "frontend/public/og-image.png"
    final_img.save(out_path, format="PNG", quality=95)
    print(f"Successfully generated {out_path}")

if __name__ == "__main__":
    create_og_image()
