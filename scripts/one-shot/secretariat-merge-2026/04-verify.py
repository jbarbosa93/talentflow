#!/usr/bin/env python3
# VERIFICATION FINALE (lecture seule) : counts, doublons, couverture, residus, enrichissements.
import json, urllib.request, urllib.parse, unicodedata, re
from collections import Counter
env={}
for l in open("/Users/joaobarbosa/Dev/talentflow/.env.local"):
    l=l.strip()
    if not l or l.startswith("#") or "=" not in l: continue
    k,v=l.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
URL=env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); KEY=env["SUPABASE_SERVICE_ROLE_KEY"]
def fetch(t,sel="*"):
    return json.load(urllib.request.urlopen(urllib.request.Request(
        f"{URL}/rest/v1/{t}?select={urllib.parse.quote(sel)}&limit=10000",
        headers={"apikey":KEY,"Authorization":f"Bearer {KEY}"})))
def norm(s):
    if s is None:return ""
    s=unicodedata.normalize("NFKD",str(s).strip().lower())
    s="".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+"," ",s).strip()
d=json.load(open("xlsx_dump.json")); CF=d["Candidat actif_2026 copie.xlsx"]; AF=d["Cas Accident - Maladie _2026 copie.xlsx"]
bk=json.load(open("backup_secretariat.json"))
def rows_of(sh):
    H=sh["header"]; return [{H[j]:(r[j] if j<len(r) else None) for j in range(len(H))} for r in sh["rows"]]
def col(sh,n):
    H=sh["header"]
    try:j=H.index(n)
    except ValueError:return []
    return [(r[j] if j<len(r) else None) for r in sh["rows"]]
OK="✅"; KO="❌"
def chk(cond,msg): print(f"  {OK if cond else KO} {msg}")

print("="*70); print("1) COMPTAGES base == Excel"); print("="*70)
exp={"secretariat_candidats":341+249,"secretariat_accidents":82+43,"secretariat_alfa":122+86,"secretariat_alfa_paiements":58+35,"secretariat_loyers":2}
counts={}
for t,e in exp.items():
    n=len(fetch(t,"id")); counts[t]=n; chk(n==e,f"{t}: {n} (attendu {e})")

print("="*70); print("2) DOUBLONS"); print("="*70)
cand=fetch("secretariat_candidats","numero_quadrigis,nom,prenom,annee,candidat_id,couleur")
dn=Counter((norm(c["nom"]),norm(c.get("prenom")),c["annee"]) for c in cand)
dn={k:v for k,v in dn.items() if v>1}
chk(not dn, f"candidats VRAIS doublons (nom,prénom,annee): {dn if dn else 'aucun'}")
from collections import defaultdict
qd=defaultdict(set)
for c in cand:
    q=str(c.get('numero_quadrigis') or '').strip()
    if q: qd[q].add(norm(c['nom'])+'|'+norm(c.get('prenom')))
shared={q:len(v) for q,v in qd.items() if len(v)>1}
print(f"  ℹ️  N°Quad partagés par ≥2 personnes différentes (anomalie Excel à signaler): {len(shared)} -> {list(shared)[:6]}")
for t,keyf in [("secretariat_alfa",lambda x:(norm(x['nom']),norm(x.get('prenom')),x['annee'])),
               ("secretariat_accidents",lambda x:(norm(x['nom_prenom']),x.get('numero_sinistre'),x['annee']))]:
    rows=fetch(t)
    dd=Counter(keyf(x) for x in rows); dd={k:v for k,v in dd.items() if v>1}
    chk(not dd, f"{t} doublons exacts: {len(dd)} ({list(dd)[:3] if dd else 'aucun'})")

print("="*70); print("3) COUVERTURE : chaque ligne Excel présente en base"); print("="*70)
# candidats par quad+annee
base_cq={(str(c.get('numero_quadrigis') or '').strip(),c['annee']) for c in cand if c.get('numero_quadrigis')}
miss=[]
for yr,sh in [(2025,"Candidats 2025"),(2026,"Candidats 2026")]:
    for q in col(CF[sh],"N°Quad"):
        if q not in (None,"","-") and (str(q).strip(),yr) not in base_cq: miss.append((q,yr))
chk(not miss, f"candidats Excel manquants en base: {len(miss)} {miss[:5]}")
# accidents par sinistre(digits)
acc=fetch("secretariat_accidents","numero_sinistre,nom_prenom,annee")
base_sin={re.sub(r'[^0-9]','',str(a.get('numero_sinistre') or '')) for a in acc if a.get('numero_sinistre')}
missa=[]
for sh in ["Accident-Maladie 2025","Accident-Maladie 2026"]:
    for s in col(AF[sh],"N° sinistre"):
        ds=re.sub(r'[^0-9]','',str(s or ''))
        if ds and ds not in base_sin: missa.append(s)
chk(not missa, f"accidents Excel (avec sinistre) manquants: {len(missa)} {missa[:5]}")

print("="*70); print("4) RÉSIDUS : tout en base existe dans l'Excel"); print("="*70)
xlq=set(); xlnames=set()
for sh in ["Candidats 2025","Candidats 2026"]:
    for r in rows_of(CF[sh]):
        q=r.get("N°Quad");
        if q not in (None,"","-"): xlq.add(str(q).strip())
        xlnames.add(norm(r.get("Nom"))+"|"+norm(r.get("Pénom")))
resid=[(c["nom"],c.get("prenom"),c.get("numero_quadrigis")) for c in cand
       if str(c.get("numero_quadrigis") or "").strip() not in xlq and norm(c["nom"])+"|"+norm(c.get("prenom")) not in xlnames]
chk(not resid, f"candidats résidus (hors Excel): {len(resid)} {resid[:5]}")
ceesay=[c for c in cand if norm(c["nom"])=="ceesay"]
chk(not ceesay, f"Ceesay Ousman supprimé: {'oui' if not ceesay else 'NON'}")

print("="*70); print("5) ENRICHISSEMENTS préservés (candidat_id)"); print("="*70)
for t in ["secretariat_candidats","secretariat_accidents","secretariat_alfa","secretariat_alfa_paiements"]:
    now=fetch(t,"candidat_id"); nb_now=sum(1 for x in now if x.get("candidat_id"))
    nb_bk=sum(1 for x in bk[t] if x.get("candidat_id"))
    chk(nb_now>=nb_bk*0.9, f"{t}: candidat_id liés {nb_now} (backup {nb_bk})")

print("="*70); print("6) SPOT-CHECK valeurs (mapping correct)"); print("="*70)
c=fetch("secretariat_candidats","nom,prenom,numero_quadrigis,genre_permis,date_echeance_permis,is_mission_terminee,date_fin_mission,archive,carte_id,has_cv")
def find(q): return next((x for x in c if str(x.get("numero_quadrigis"))==q),None)
# Aguilar Martinez 125011 : Excel date echeance 28,09,2026, Mission terminée 21,05,2026
a=find("125011")
if a: chk(a.get("date_fin_mission")=="2026-05-21" and a.get("is_mission_terminee"), f"Aguilar 125011 fin mission={a.get('date_fin_mission')} term={a.get('is_mission_terminee')}")
# Aissaoui 125010 : Mission terminée ARCHIVE -> archive true
b=find("125010")
if b: chk(b.get("archive"), f"Aissaoui 125010 archive={b.get('archive')}")
# Adornetto 124771 : genre B
e=find("124771")
if e: chk(e.get("genre_permis")=="B", f"Adornetto 124771 genre={e.get('genre_permis')}")
print("\nComptes finaux:",counts)
