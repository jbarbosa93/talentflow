#!/usr/bin/env python3
# v2.9.98 — Manuel candidat 1 page (A4) : « Comment remplir ton rapport d'heures ».
# Design soigné : en-tête L-Agence + Metabader, étapes numérotées, astuce GPS, pied WhatsApp.
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PUB = os.path.join(ROOT, 'public')
OUT = os.path.expanduser('~/Desktop/Manuel-Candidat-Rapport-Heures.pdf')
# Logo Metabader optionnel : si présent sur le Bureau, on l'utilise à la place du wordmark.
MB_LOGO = os.path.expanduser('~/Desktop/metabader.png')

W, H = A4  # 595 x 842 pt

INK = (0.11, 0.10, 0.08)
YELLOW = (0.969, 0.788, 0.282)
MBLUE = (0.18, 0.42, 0.72)
GREEN = (0.08, 0.50, 0.20)
MUTED = (0.42, 0.40, 0.36)
CREAM = (0.980, 0.980, 0.969)

c = canvas.Canvas(OUT, pagesize=A4)

def setfill(rgb): c.setFillColorRGB(*rgb)
def setstroke(rgb): c.setStrokeColorRGB(*rgb)

setfill(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)

# En-tête blanc + 2 logos
header_h = 92
setfill((1, 1, 1)); c.rect(0, H - header_h, W, header_h, fill=1, stroke=0)
setfill(YELLOW); c.rect(0, H - header_h - 5, W, 5, fill=1, stroke=0)

# L-Agence (gauche)
try:
    img = ImageReader(os.path.join(PUB, 'logo-agence-officiel-noir.png'))
    iw, ih = img.getSize(); tw = 150; th = tw * ih / iw
    c.drawImage(img, 40, H - header_h/2 - th/2, width=tw, height=th, mask='auto')
except Exception as e:
    print('logo L-Agence fail', e)

# Metabader (droite) : vrai logo si dispo, sinon wordmark bleu
if os.path.exists(MB_LOGO):
    try:
        mi = ImageReader(MB_LOGO); miw, mih = mi.getSize()
        tw = 170; th = tw * mih / miw
        if th > 56: th = 56; tw = th * miw / mih
        c.drawImage(mi, W - 40 - tw, H - header_h/2 - th/2, width=tw, height=th, mask='auto')
    except Exception as e:
        print('logo Metabader fail', e)
else:
    setfill(MBLUE); c.setFont('Helvetica-Bold', 20)
    lbl = 'METABADER SA'; lw = stringWidth(lbl, 'Helvetica-Bold', 20)
    c.drawString(W - 40 - lw, H - header_h/2 - 1, lbl)
    setfill((0.45, 0.55, 0.72)); c.setFont('Helvetica', 9)
    sub = 'RECYCLING'; sw = stringWidth(sub, 'Helvetica', 9)
    c.drawString(W - 40 - sw, H - header_h/2 - 15, sub)

# Titre
y = H - header_h - 40
setfill(INK); c.setFont('Helvetica-Bold', 23)
c.drawString(40, y, "Comment remplir ton rapport d'heures")
y -= 19
setfill(MUTED); c.setFont('Helvetica', 12)
c.drawString(40, y, "En 3 minutes, directement depuis ton téléphone. Simple et rapide.")

# Etapes
y -= 36
STEP_X = 40; NUM_R = 14
steps = [
    ("Ouvre le lien", "Tu reçois ton lien par WhatsApp. Clique dessus : ton rapport de la semaine s'ouvre.", YELLOW),
    ("Saisis tes heures, jour par jour", "Pour chaque jour, indique l'heure de Début et de Fin. Ajoute tes pauses avec « + Pause ».", YELLOW),
    ("Le bouton « Maintenant »", "Sur place ? Clique « Maintenant » : il met l'heure exacte ET enregistre ta position (GPS).", GREEN),
    ("Zone de travail", "Indique le chantier / lieu du jour (ex. « Budron C ») dans le champ Zone de travail.", MBLUE),
    ("Absent ou en congé ?", "Clique « Absent / Congé » et choisis le motif (Vacances, Jour férié…). 0 h ce jour-là.", YELLOW),
    ("Vérifie le total et signe", "Le total des heures se calcule tout seul. Vérifie, puis signe en bas. C'est envoyé !", GREEN),
]
for i, (title, body, accent) in enumerate(steps, start=1):
    cx, cy = STEP_X + NUM_R, y - 4
    setfill(accent); c.circle(cx, cy, NUM_R, fill=1, stroke=0)
    setfill((1, 1, 1) if accent != YELLOW else INK); c.setFont('Helvetica-Bold', 13)
    n = str(i); nlw = stringWidth(n, 'Helvetica-Bold', 13)
    c.drawString(cx - nlw/2, cy - 4.5, n)
    tx = STEP_X + 2 * NUM_R + 12
    setfill(INK); c.setFont('Helvetica-Bold', 12.5); c.drawString(tx, y, title)
    setfill(MUTED); c.setFont('Helvetica', 10.5)
    max_w = W - tx - 40; line = ''; ly = y - 15
    for wd in body.split(' '):
        test = (line + ' ' + wd).strip()
        if stringWidth(test, 'Helvetica', 10.5) > max_w:
            c.drawString(tx, ly, line); ly -= 13; line = wd
        else:
            line = test
    if line: c.drawString(tx, ly, line)
    y = ly - 30

# Encadre GPS
box_h = 56; box_top = y - 2
setfill((0.93, 0.97, 0.93)); c.roundRect(40, box_top - box_h, W - 80, box_h, 9, fill=1, stroke=0)
setstroke(GREEN); c.setLineWidth(1.2); c.roundRect(40, box_top - box_h, W - 80, box_h, 9, fill=0, stroke=1)
setfill(GREEN); c.setFont('Helvetica-Bold', 11.5)
c.drawString(56, box_top - 20, "Pourquoi le GPS ?")
setfill((0.20, 0.35, 0.22)); c.setFont('Helvetica', 10.5)
c.drawString(56, box_top - 37, "Le bouton « Maintenant » prouve que tu étais bien sur le chantier. Rien à régler :")
c.drawString(56, box_top - 51, "autorise simplement la localisation quand ton téléphone le demande.")

# Encadre Astuces (sous le GPS)
y2 = box_top - box_h - 16
b2_h = 56
setfill((1.0, 0.98, 0.90)); c.roundRect(40, y2 - b2_h, W - 80, b2_h, 9, fill=1, stroke=0)
setstroke(YELLOW); c.setLineWidth(1.2); c.roundRect(40, y2 - b2_h, W - 80, b2_h, 9, fill=0, stroke=1)
setfill((0.57, 0.40, 0.05)); c.setFont('Helvetica-Bold', 11.5)
c.drawString(56, y2 - 20, "Astuces qui font gagner du temps")
setfill((0.45, 0.34, 0.05)); c.setFont('Helvetica', 10.5)
c.drawString(56, y2 - 37, "• Tu peux copier les heures d'un jour vers un autre (même horaire = 1 clic).")
c.drawString(56, y2 - 51, "• Oublié un jour ? Tu peux compléter ton rapport même en fin de semaine.")

# Pied WhatsApp
foot_h = 54
setfill(INK); c.rect(0, 0, W, foot_h, fill=1, stroke=0)
setfill((1, 1, 1)); c.setFont('Helvetica-Bold', 12)
c.drawString(40, foot_h - 21, "Une question ? Contacte L-Agence SA")
setfill(YELLOW); c.setFont('Helvetica-Bold', 13)
c.drawString(40, foot_h - 39, "WhatsApp / Tel : +41 76 297 97 95")
setfill((0.65, 0.65, 0.68)); c.setFont('Helvetica', 8.5)
ref = "L-Agence SA - Av. des Alpes 3 - 1870 Monthey - talent-flow.ch"
rw = stringWidth(ref, 'Helvetica', 8.5)
c.drawString(W - 40 - rw, foot_h - 31, ref)

c.showPage(); c.save()
print('written', OUT)
