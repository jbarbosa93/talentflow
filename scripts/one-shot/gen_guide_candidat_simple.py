#!/usr/bin/env python3
# v2.10.9 — Guide candidat « total d'heures » (template SANS timbreuse).
# Version illustrée (mockups vectoriels, pas de captures iPhone) — autonome.
# Parcours : accéder au rapport (lien permanent / app) → saisir le total
# d'heures par jour (+ déplacement / n° chantier / repas) → signer → envoyer.
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PUB = os.path.join(ROOT, 'public')
OUT = os.path.expanduser('~/Desktop/Guide-Candidat-Rapport-Heures-Simple.pdf')

W, H = A4
INK = (0.11, 0.10, 0.08)
YELLOW = (0.969, 0.788, 0.282)
GREEN = (0.08, 0.50, 0.20)
BLUE = (0.18, 0.42, 0.72)
RED = (0.86, 0.15, 0.15)
MUTED = (0.42, 0.40, 0.36)
CREAM = (0.980, 0.980, 0.969)
LINE = (0.86, 0.86, 0.83)
FIELD = (0.97, 0.97, 0.95)

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

def phone_frame(x, y_top, w, h):
    """Cadre smartphone (bezel arrondi + écran + barre Safari)."""
    # ombre
    setfill((0.85, 0.85, 0.83)); c.roundRect(x + 3, y_top - h - 3, w, h, 16, fill=1, stroke=0)
    # bezel
    setfill((0.10, 0.10, 0.12)); c.roundRect(x, y_top - h, w, h, 16, fill=1, stroke=0)
    # écran
    pad = 5
    setfill((1, 1, 1)); c.roundRect(x + pad, y_top - h + 26, w - 2*pad, h - 26 - 22, 9, fill=1, stroke=0)
    # encoche
    setfill((0.10, 0.10, 0.12)); c.roundRect(x + w/2 - 24, y_top - 14, 48, 9, 4, fill=1, stroke=0)
    # barre Safari (bas)
    setfill((0.95, 0.95, 0.95)); c.roundRect(x + pad, y_top - h + 4, w - 2*pad, 20, 7, fill=1, stroke=0)
    setfill(MUTED); c.setFont('Helvetica', 7)
    url = 'talent-flow.ch'
    c.drawString(x + w/2 - stringWidth(url, 'Helvetica', 7)/2, y_top - h + 11, url)
    return (x + pad + 6, y_top - h + 30, w - 2*pad - 12, h - 26 - 26)  # zone contenu (x,yb,w,h)

def field_box(x, yb, w, h, label, value='', placeholder=True):
    setfill(MUTED); c.setFont('Helvetica', 7.5)
    c.drawString(x, yb + h + 3, label)
    setfill(FIELD); setstroke(LINE); c.setLineWidth(0.8)
    c.roundRect(x, yb, w, h, 4, fill=1, stroke=1)
    if value:
        setfill(INK); c.setFont('Helvetica-Bold', 9)
        c.drawString(x + 6, yb + h/2 - 3, value)
    elif placeholder:
        setfill((0.7, 0.7, 0.68)); c.setFont('Helvetica', 9)
        c.drawString(x + 6, yb + h/2 - 3, '—')

# ─────────────── PAGE 1 ───────────────
setfill(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
header("Guide collaborateur · Rapport d'heures")

y = H - 78 - 40
setfill(INK); c.setFont(TITLE_FONT, 27)
c.drawString(40, y, "Ton rapport d'heures, pas à pas")
y -= 18
setfill(MUTED); c.setFont('Helvetica', 12)
c.drawString(40, y, "Tout se fait depuis ton téléphone, en quelques minutes.")

# Etape 1 — Accède à ton rapport (bandeau)
y -= 30
b_h = 64
setfill((1.0, 0.97, 0.86)); c.roundRect(40, y - b_h, W - 80, b_h, 9, fill=1, stroke=0)
setstroke(YELLOW); c.setLineWidth(1.2); c.roundRect(40, y - b_h, W - 80, b_h, 9, fill=0, stroke=1)
num_marker(62, y - 18, 1, color=(0.72, 0.55, 0.05), r=11)
setfill(INK); c.setFont('Helvetica-Bold', 12.5)
c.drawString(82, y - 14, "Accède à ton rapport")
setfill((0.45, 0.34, 0.05)); c.setFont('Helvetica', 10.5)
c.drawString(82, y - 30, "Tu reçois ton lien personnel par WhatsApp ou e-mail. C'est un lien permanent :")
c.drawString(82, y - 44, "le même chaque semaine. Mets-le en favori, ou installe l'app sur ton téléphone")
c.drawString(82, y - 58, "(menu du navigateur -> « Sur l'écran d'accueil ») pour y accéder en 1 clic.")

# Etape 2 — Ouvre ton rapport (mockup liste + légende)
y -= b_h + 24
setfill(INK); c.setFont('Helvetica-Bold', 14)
num_marker(49, y - 4, 2, color=GREEN, r=11)
setfill(INK); c.drawString(70, y - 8, "Ouvre ton rapport")

ph_x, ph_w, ph_h = 40, 176, 300
cx, cyb, cw, chh = phone_frame(ph_x, y - 20, ph_w, ph_h)
ct = cyb + chh  # haut de la zone contenu
# Titre appli
setfill(INK); c.setFont('Helvetica-Bold', 10)
c.drawString(cx, ct - 14, "Bonjour,")
# bouton Nouveau rapport
setfill(YELLOW); c.roundRect(cx, ct - 46, cw, 24, 6, fill=1, stroke=0)
setfill(INK); c.setFont('Helvetica-Bold', 9.5)
lab = "+ Nouveau rapport"
c.drawString(cx + cw/2 - stringWidth(lab, 'Helvetica-Bold', 9.5)/2, ct - 40, lab)
num_marker(cx + cw - 8, ct - 34, 1, GREEN, 8)
# liste
setfill(MUTED); c.setFont('Helvetica', 7)
c.drawString(cx, ct - 60, "MES DERNIERS RAPPORTS")
def rowcard(yb, week, status, scol):
    setfill((0.99, 0.99, 0.98)); setstroke(LINE); c.setLineWidth(0.8)
    c.roundRect(cx, yb, cw, 26, 5, fill=1, stroke=1)
    setfill(INK); c.setFont('Helvetica-Bold', 8)
    c.drawString(cx + 6, yb + 14, week)
    setfill(MUTED); c.setFont('Helvetica', 7)
    c.drawString(cx + 6, yb + 5, "Société SA")
    setfill(scol); c.roundRect(cx + cw - 52, yb + 7, 46, 13, 6, fill=1, stroke=0)
    setfill((1, 1, 1)); c.setFont('Helvetica-Bold', 7)
    c.drawString(cx + cw - 52 + 23 - stringWidth(status, 'Helvetica-Bold', 7)/2, yb + 11, status)
rowcard(ct - 92, "S23 · 01.06 -> 07.06", "Brouillon", (0.55, 0.55, 0.55))
rowcard(ct - 122, "S22 · 25.05 -> 31.05", "Validé", GREEN)
num_marker(cx + cw - 8, ct - 96, 2, GREEN, 8)
# récap
setfill(INK); c.roundRect(cx, ct - 152, cw, 22, 6, fill=1, stroke=0)
setfill((1, 1, 1)); c.setFont('Helvetica-Bold', 8.5)
lab2 = "Récapitulatif par période"
c.drawString(cx + cw/2 - stringWidth(lab2, 'Helvetica-Bold', 8.5)/2, ct - 145, lab2)
num_marker(cx + cw - 8, ct - 141, 3, GREEN, 8)

lx = ph_x + ph_w + 28
ly = y - 24
ly = legend_item(lx, ly, 1, "Nouveau rapport", "Démarre le rapport de la semaine en cours.", GREEN, 250)
ly = legend_item(lx, ly, 2, "Tes rapports", "Brouillon (en cours) ou Validé (déjà signé). Clique pour rouvrir.", GREEN, 250)
ly = legend_item(lx, ly, 3, "Récapitulatif", "Le total de tes heures sur une période.", GREEN, 250)

footer()
c.showPage()

# ─────────────── PAGE 2 ───────────────
setfill(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)
header("Guide collaborateur · Rapport d'heures")

y = H - 78 - 38
setfill(INK); c.setFont('Helvetica-Bold', 14)
num_marker(49, y - 4, 3, color=BLUE, r=11)
setfill(INK); c.drawString(70, y - 8, "Saisis tes heures, jour par jour")

ph_x, ph_w, ph_h = 40, 188, 318
cx, cyb, cw, chh = phone_frame(ph_x, y - 22, ph_w, ph_h)
ct = cyb + chh
# en-tête étape
setfill(BLUE); c.setFont('Helvetica-Bold', 7.5)
c.drawString(cx, ct - 12, "ÉTAPE 1 / 4")
# carte du jour
setfill((1.0, 0.99, 0.95)); setstroke((0.92, 0.86, 0.62)); c.setLineWidth(1)
card_y = cyb + 6
c.roundRect(cx, card_y, cw, chh - 30, 8, fill=1, stroke=1)
ix = cx + 12; iw = cw - 24
top = ct - 30
setfill(INK); c.setFont('Helvetica-Bold', 10)
c.drawString(ix, top, "• Lundi 01.06.2026")
# Heures normales (rempli pour l'exemple)
fb_w = iw
field_box(ix, top - 38, fb_w, 22, "Heures normales (total du jour)", value="8.5")
num_marker(ix + fb_w - 6, top - 27, 1, BLUE, 8)
# Temps de déplacement
field_box(ix, top - 82, fb_w, 22, "Temps de déplacement")
num_marker(ix + fb_w - 6, top - 71, 2, BLUE, 8)
# N° chantier
field_box(ix, top - 126, fb_w, 22, "Numéro du chantier", value="Budron C")
num_marker(ix + fb_w - 6, top - 115, 3, BLUE, 8)
# Repas (checkbox)
setfill(FIELD); setstroke(LINE); c.setLineWidth(0.8)
c.roundRect(ix, top - 158, 14, 14, 3, fill=1, stroke=1)
setstroke(GREEN); c.setLineWidth(1.6)
c.line(ix + 3, top - 151, ix + 6, top - 154); c.line(ix + 6, top - 154, ix + 11, top - 147)
setfill(INK); c.setFont('Helvetica', 9)
c.drawString(ix + 22, top - 154, "Repas")
num_marker(ix + fb_w - 6, top - 151, 4, BLUE, 8)
# total semaine (bas de carte)
setfill((0.93, 0.97, 0.93)); c.roundRect(ix, card_y + 8, iw, 22, 5, fill=1, stroke=0)
setfill(INK); c.setFont('Helvetica-Bold', 8.5)
c.drawString(ix + 6, card_y + 15, "Total de la semaine")
setfill(GREEN); c.setFont('Helvetica-Bold', 9.5)
c.drawString(ix + iw - 34, card_y + 15, "8.5 h")

lx = ph_x + ph_w + 26
ly = y - 26
ly = legend_item(lx, ly, 1, "Heures du jour", "Inscris ton TOTAL d'heures travaillées ce jour-là (ex. 8.5). C'est le seul champ vraiment obligatoire.", BLUE, 250)
ly = legend_item(lx, ly, 2, "Temps de déplacement", "Si tu as droit à du temps de trajet, indique-le. Sinon laisse vide.", BLUE, 250)
ly = legend_item(lx, ly, 3, "Numéro du chantier", "Le chantier / lieu où tu as travaillé (ex. « Budron C »).", BLUE, 250)
ly = legend_item(lx, ly, 4, "Repas", "Coche la case si tu as eu droit au repas ce jour-là.", BLUE, 250)
ly = legend_item(lx, ly, 5, "Jour non travaillé", "Laisse simplement le jour vide. Le total de la semaine se calcule tout seul.", BLUE, 250)

# Etape 4 — Signer
y = y - ph_h - 40
setfill(INK); c.setFont('Helvetica-Bold', 14)
num_marker(49, y - 4, 4, color=GREEN, r=11)
setfill(INK); c.drawString(70, y - 8, "Signe et envoie")

s_x, s_w, s_h = 40, 150, 150
scx, scyb, scw, schh = phone_frame(s_x, y - 18, s_w, s_h)
sct = scyb + schh
setfill(GREEN); c.setFont('Helvetica-Bold', 7)
c.drawString(scx, sct - 12, "ÉTAPE 4 / 4")
setfill(INK); c.setFont('Helvetica-Bold', 9)
c.drawString(scx, sct - 30, "Signature")
# cadre signature
setfill((1.0, 0.99, 0.95)); setstroke(YELLOW); c.setLineWidth(1.2)
c.roundRect(scx, scyb + 34, scw, 50, 6, fill=1, stroke=1)
setfill(MUTED); c.setFont('Helvetica', 8)
lab3 = "Signe ici avec ton doigt"
c.drawString(scx + scw/2 - stringWidth(lab3, 'Helvetica', 8)/2, scyb + 56, lab3)
# bouton confirmer
setfill(YELLOW); c.roundRect(scx, scyb + 6, scw, 22, 6, fill=1, stroke=0)
setfill(INK); c.setFont('Helvetica-Bold', 8.5)
lab4 = "Confirmer et envoyer"
c.drawString(scx + scw/2 - stringWidth(lab4, 'Helvetica-Bold', 8.5)/2, scyb + 13, lab4)

lx = s_x + s_w + 40
ly = y - 22
ly = legend_item(lx, ly, 1, "Signer ici", "À la dernière étape, clique « Signer ici » et dessine ta signature au doigt.", GREEN, 300)
ly = legend_item(lx, ly, 2, "Confirmer et envoyer", "Clique « Confirmer et envoyer ». C'est transmis à L-Agence. Terminé !", GREEN, 300)

footer()
c.showPage()
c.save()
print('written', OUT)
