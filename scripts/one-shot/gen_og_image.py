#!/usr/bin/env python3
# v2.9.92 — Génère l'image Open Graph (aperçu de lien WhatsApp/iMessage) 1200x630.
# Fond clair épuré + logo L-Agence centré + bande jaune brand + sous-titre.
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PUB = os.path.join(ROOT, 'public')

CREAM = (250, 250, 247)
INK = (28, 26, 20)
YELLOW = (247, 201, 72)
MUTED = (120, 113, 100)

img = Image.new('RGB', (W, H), CREAM)
d = ImageDraw.Draw(img)

# Bande jaune en bas (accent brand)
d.rectangle([0, H - 14, W, H], fill=YELLOW)

# Logo L-Agence (noir sur clair) centré, large
logo = Image.open(os.path.join(PUB, 'logo-agence-officiel-noir.png')).convert('RGBA')
target_w = 620
ratio = target_w / logo.width
logo = logo.resize((target_w, int(logo.height * ratio)), Image.LANCZOS)
lx = (W - logo.width) // 2
ly = 200
img.paste(logo, (lx, ly), logo)

def font(size, bold=False):
    paths = [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

def center_text(text, y, f, fill):
    bbox = d.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    d.text(((W - tw) // 2, y), text, font=f, fill=fill)

# Sous-titre
center_text("Rapports d'heures & Signatures électroniques", ly + logo.height + 46, font(40, bold=True), INK)
center_text("Sécurisé · talent-flow.ch", ly + logo.height + 110, font(28), MUTED)

out = os.path.join(PUB, 'og-image.png')
img.save(out, 'PNG')
print('written', out, img.size)
