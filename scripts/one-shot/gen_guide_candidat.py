#!/usr/bin/env python3
# v2.9.99 — Guide candidat « whaou » 2 pages (A4) avec vraies captures iPhone,
# numéros entourés + légende, typo élégante. Couvre tout le parcours :
# création de compte (email + mdp) → ouvrir le rapport → saisir les heures
# (Début/Fin/Maintenant/GPS/pauses/zone/absent) → signer → envoyer.
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PUB = os.path.join(ROOT, 'public')
SHOTS = os.path.expanduser('~/Desktop/Manuel TalentFlow Rapports')
OUT = os.path.expanduser('~/Desktop/Guide-Candidat-Rapport-Heures.pdf')

W, H = A4
INK = (0.11, 0.10, 0.08)
YELLOW = (0.969, 0.788, 0.282)
GREEN = (0.08, 0.50, 0.20)
BLUE = (0.18, 0.42, 0.72)
RED = (0.86, 0.15, 0.15)
MUTED = (0.42, 0.40, 0.36)
CREAM = (0.980, 0.980, 0.969)

# Polices élégantes
TITLE_FONT = 'Helvetica-Bold'
try:
    pdfmetrics.registerFont(TTFont('Didot', '/System/Library/Fonts/Supplemental/Didot.ttc', subfontIndex=0))
    TITLE_FONT = 'Didot'
except Exception:
    try:
        pdfmetrics.registerFont(TTFont('Georgia-B', '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'))
        TITLE_FONT = 'Georgia-B'
    except Exception:
        pass

c = canvas.Canvas(OUT, pagesize=A4)
def setfill(x): c.setFillColorRGB(*x)
def setstroke(x): c.setStrokeColorRGB(*x)

def wrap(txt, font, size, maxw):
    out, line = [], ''
    for wd in txt.split(' '):
        t = (line + ' ' + wd).strip()
        if stringWidth(t, font, size) > maxw and line:
            out.append(line); line = wd
        else:
            line = t
    if line: out.append(line)
    return out

def header(subtitle):
    hh = 78
    setfill((1, 1, 1)); c.rect(0, H - hh, W, hh, fill=1, stroke=0)
    setfill(YELLOW); c.rect(0, H - hh - 5, W, 5, fill=1, stroke=0)
    try:
        img = ImageReader(os.path.join(PUB, 'logo-agence-officiel-noir.png'))
        iw, ih = img.getSize(); tw = 140; th = tw * ih / iw
        c.drawImage(img, 40, H - hh/2 - th/2, width=tw, height=th, mask='auto')
    except Exception:
        pass
    setfill(MUTED); c.setFont('Helvetica', 10.5)
    lw = stringWidth(subtitle, 'Helvetica', 10.5)
    c.drawString(W - 40 - lw, H - hh/2 - 3, subtitle)

def footer():
    fh = 50
    setfill(INK); c.rect(0, 0, W, fh, fill=1, stroke=0)
    setfill((1, 1, 1)); c.setFont('Helvetica-Bold', 11.5)
    c.drawString(40, fh - 20, "Une question ? Contacte L-Agence SA")
    setfill(YELLOW); c.setFont('Helvetica-Bold', 12.5)
    c.drawString(40, fh - 37, "WhatsApp / Tel : +41 76 297 97 95")
    setfill((0.65, 0.65, 0.68)); c.setFont('Helvetica', 8)
    ref = "talent-flow.ch"
    c.drawString(W - 40 - stringWidth(ref, 'Helvetica', 8), fh - 30, ref)

def draw_phone(path, x, y_top, w):
    """Dessine une capture (cadre arrondi + ombre). Retourne (h, ih)."""
    img = ImageReader(path); iw, ih = img.getSize()
    h = w * ih / iw
    # ombre
    setfill((0.85, 0.85, 0.83)); c.roundRect(x + 3, y_top - h - 3, w, h, 10, fill=1, stroke=0)
    # image
    c.drawImage(img, x, y_top - h, width=w, height=h, mask='auto')
    setstroke((0.80, 0.80, 0.78)); c.setLineWidth(1)
    c.roundRect(x, y_top - h, w, h, 10, fill=0, stroke=1)
    return h

def num_marker(cx, cy, n, color=RED, r=9):
    setfill(color); c.circle(cx, cy, r, fill=1, stroke=0)
    setstroke((1, 1, 1)); c.setLineWidth(1.4); c.circle(cx, cy, r, fill=0, stroke=1)
    setfill((1, 1, 1)); c.setFont('Helvetica-Bold', 10.5)
    s = str(n); c.drawString(cx - stringWidth(s, 'Helvetica-Bold', 10.5)/2, cy - 3.6, s)

def legend_item(x, y, n, title, body, color=RED, maxw=230):
    num_marker(x + 9, y - 4, n, color, 9)
    tx = x + 26
    setfill(INK); c.setFont('Helvetica-Bold', 11)
    c.drawString(tx, y, title)
    setfill(MUTED); c.setFont('Helvetica', 9.8)
    ly = y - 13
    for ln in wrap(body, 'Helvetica', 9.8, maxw):
        c.drawString(tx, ly, ln); ly -= 12
    return ly - 8

# ─────────────── PAGE 1 ───────────────
setfill(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
header("Guide collaborateur · Rapport d'heures")

y = H - 78 - 40
setfill(INK); c.setFont(TITLE_FONT, 27)
c.drawString(40, y, "Ton rapport d'heures, pas à pas")
y -= 18
setfill(MUTED); c.setFont('Helvetica', 12)
c.drawString(40, y, "Tout se fait depuis ton téléphone, en quelques minutes.")

# Etape 1 — Créer ton compte (bandeau)
y -= 30
b_h = 64
setfill((1.0, 0.97, 0.86)); c.roundRect(40, y - b_h, W - 80, b_h, 9, fill=1, stroke=0)
setstroke(YELLOW); c.setLineWidth(1.2); c.roundRect(40, y - b_h, W - 80, b_h, 9, fill=0, stroke=1)
num_marker(62, y - 18, 1, color=(0.72, 0.55, 0.05), r=11)
setfill(INK); c.setFont('Helvetica-Bold', 12.5)
c.drawString(82, y - 14, "Crée ton compte")
setfill((0.45, 0.34, 0.05)); c.setFont('Helvetica', 10.5)
c.drawString(82, y - 30, "Tu reçois un e-mail de L-Agence avec un lien. Clique dessus, puis choisis")
c.drawString(82, y - 44, "ton mot de passe. Ton identifiant = ton e-mail. (À faire une seule fois.)")
c.drawString(82, y - 58, "Ensuite, chaque semaine, tu reçois ton lien de rapport par WhatsApp ou e-mail.")

# Etape 2 — Ouvre ton rapport (capture 3256 à gauche + légende)
y -= b_h + 24
setfill(INK); c.setFont('Helvetica-Bold', 14)
num_marker(49, y - 4, 2, color=GREEN, r=11)
setfill(INK); c.drawString(70, y - 8,"Ouvre ton rapport")
y -= 24
ph_x, ph_w = 40, 168
ph_h = draw_phone(os.path.join(SHOTS, 'IMG_3256.PNG'), ph_x, y, ph_w)
# marqueurs sur la capture (fractions de hauteur depuis le haut)
def mk(frac_x, frac_y, n, color=RED):
    num_marker(ph_x + frac_x * ph_w, y - frac_y * ph_h, n, color, 8.5)
mk(0.50, 0.13, 1, GREEN)   # Nouveau rapport
mk(0.50, 0.30, 2, GREEN)   # liste rapports
mk(0.50, 0.46, 3, GREEN)   # récap par période
# légende à droite
lx = ph_x + ph_w + 28
ly = y - 4
ly = legend_item(lx, ly, 1, "Nouveau rapport", "Démarre le rapport de la semaine en cours.", GREEN)
ly = legend_item(lx, ly, 2, "Tes rapports", "Brouillon (en cours) ou Validé (déjà signé). Clique pour rouvrir.", GREEN)
ly = legend_item(lx, ly, 3, "Récapitulatif", "Le total de tes heures sur une période.", GREEN)

footer()
c.showPage()

# ─────────────── PAGE 2 ───────────────
setfill(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
header("Guide collaborateur · Rapport d'heures")

y = H - 78 - 38
setfill(INK); c.setFont('Helvetica-Bold', 14)
num_marker(49, y - 4, 3, color=BLUE, r=11)
setfill(INK); c.drawString(70, y - 8,"Saisis tes heures, jour par jour")
y -= 22

ph_x, ph_w = 40, 176
ph_h = draw_phone(os.path.join(SHOTS, 'IMG_3257.PNG'), ph_x, y, ph_w)
def mk2(frac_y, n, frac_x=0.92, color=RED):
    num_marker(ph_x + frac_x * ph_w, y - frac_y * ph_h, n, color, 8.5)
mk2(0.31, 1, 0.30, BLUE)   # Présent / Absent
mk2(0.40, 2, color=BLUE)   # Début + Maintenant
mk2(0.52, 3, color=BLUE)   # Pauses
mk2(0.74, 4, 0.88, BLUE)   # Total
mk2(0.87, 5, color=BLUE)   # Zone

lx = ph_x + ph_w + 26
ly = y - 4
ly = legend_item(lx, ly, 1, "Présent / Absent", "Choisis « Absent / Congé » si tu n'as pas travaillé (motif : vacances, férié…).", BLUE, 250)
ly = legend_item(lx, ly, 2, "Début, Fin + « Maintenant »", "Tape l'heure, ou clique « Maintenant » : il met l'heure exacte + ta position GPS.", BLUE, 250)
ly = legend_item(lx, ly, 3, "Pauses", "Ajoute autant de pauses que nécessaire avec « + Pause ».", BLUE, 250)
ly = legend_item(lx, ly, 4, "Total travaillé", "Calculé tout seul (Fin − Début − pauses). Rien à faire.", BLUE, 250)
ly = legend_item(lx, ly, 5, "Zone de travail", "Indique le chantier / lieu du jour (ex. « Budron C »).", BLUE, 250)

# Etape 4 — Signer (2 captures + légende)
y = y - ph_h - 26
setfill(INK); c.setFont('Helvetica-Bold', 14)
num_marker(49, y - 4, 4, color=GREEN, r=11)
setfill(INK); c.drawString(70, y - 8,"Signe et envoie")
y -= 20
s_w = 132
draw_phone(os.path.join(SHOTS, 'IMG_3260.PNG'), 40, y, s_w)
draw_phone(os.path.join(SHOTS, 'IMG_3261.PNG'), 40 + s_w + 18, y, s_w)
lx = 40 + 2 * s_w + 44
ly = y - 4
ly = legend_item(lx, ly, 1, "Signer ici", "Va à la dernière étape, clique « Signer ici ».", GREEN, 200)
ly = legend_item(lx, ly, 2, "Dessine au doigt", "Signe dans le cadre, puis « Adopter et signer ».", GREEN, 200)
ly = legend_item(lx, ly, 3, "Confirmer et envoyer", "C'est envoyé à L-Agence. Terminé !", GREEN, 200)

footer()
c.showPage()
c.save()
print('written', OUT)
