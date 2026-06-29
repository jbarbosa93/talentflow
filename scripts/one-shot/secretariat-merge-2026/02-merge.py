#!/usr/bin/env python3
# MIROIR STRICT par REMPLACEMENT COMPLET par annee. Idempotent, sans collision.
# python3 merge2.py  => DRY | python3 merge2.py EXEC => execution
import json, urllib.request, urllib.parse, unicodedata, re, sys, datetime
DRY = (len(sys.argv) < 2 or sys.argv[1] != "EXEC")
env={}
for l in open("/Users/joaobarbosa/Dev/talentflow/.env.local"):
    l=l.strip()
    if not l or l.startswith("#") or "=" not in l: continue
    k,v=l.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
URL=env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); KEY=env["SUPABASE_SERVICE_ROLE_KEY"]
HD={"apikey":KEY,"Authorization":f"Bearer {KEY}","Content-Type":"application/json"}
def now_iso(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def http(method,path,body=None,prefer="return=minimal"):
    data=json.dumps(body).encode() if body is not None else None
    h=dict(HD); h["Prefer"]=prefer
    req=urllib.request.Request(URL+path,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(req) as r:
            t=r.read().decode(); return r.status,(json.loads(t) if t.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code,e.read().decode()
def uniform(rows):
    if not rows: return rows
    keys=set()
    for r in rows: keys|=set(r.keys())
    return [{k:r.get(k) for k in keys} for r in rows]

def norm(s):
    if s is None: return ""
    s=unicodedata.normalize("NFKD",str(s).strip().lower())
    s="".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+"," ",s).strip()
def isdash(v): return v is None or str(v).strip() in ("","-","–")
def s_or_none(v): return None if isdash(v) else str(v).strip()
bad_dates=[]
def parse_date(v):
    if isdash(v): return None
    s=str(v).strip()
    m=re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})",s)
    if m: y,mo,d=int(m.group(1)),int(m.group(2)),int(m.group(3))
    else:
        s2=re.split(r"[\n;]",s)[0].strip()
        m=re.match(r"(\d{1,2})[,./ ]+(\d{1,2})[,./ ]+(\d{2,4})",s2)
        if m:
            d,mo,y=int(m.group(1)),int(m.group(2)),int(m.group(3))
            if y<100: y=2000+y
        else:
            m=re.match(r"(\d{4})[,./ ]+(\d{1,2})[,./ ]+(\d{1,2})",s2)
            if m: y,mo,d=int(m.group(1)),int(m.group(2)),int(m.group(3))
            else: return None
    try: datetime.date(y,mo,d); return f"{y:04d}-{mo:02d}-{d:02d}"
    except ValueError: bad_dates.append(s); return None
def to_num(v):
    if isdash(v): return None
    s=str(v).replace("'","").replace(" ","").strip(); s=re.sub(r"[,.\-]+$","",s)
    if "," in s and "." not in s: s=s.replace(",",".")
    else: s=s.replace(",","")
    try: return float(s)
    except: return None
def to_int(v):
    n=to_num(v); return int(n) if n is not None else None
def doc_bool(v): return (not isdash(v))
def avs_norm(v): return None if isdash(v) else str(v).strip().replace(",",".")
MISS=object()
def get(row,*names):
    for n in names:
        if n in row: return row[n]
    return MISS

d=json.load(open("xlsx_dump.json")); CF=d["Candidat actif_2026 copie.xlsx"]; AF=d["Cas Accident - Maladie _2026 copie.xlsx"]
def rows_of(sh):
    Hh=sh["header"]
    return [ {Hh[j]:(r[j] if j<len(r) else None) for j in range(len(Hh))} for r in sh["rows"] ]
bk=json.load(open("backup_secretariat.json"))
ambigus=[]; report={}; disappeared={}

def replace_year(table, yr, newrows):
    report.setdefault(table,{})[yr]={"insert":len(newrows)}
    if not DRY:
        st,resp=http("DELETE",f"/rest/v1/{table}?annee=eq.{yr}")
        if st>=300: print("  ERR del",table,yr,st,str(resp)[:200])
        for i in range(0,len(newrows),100):
            st,resp=http("POST",f"/rest/v1/{table}",uniform(newrows[i:i+100]))
            if st>=300: print("  ERR ins",table,yr,st,str(resp)[:300])

# ===== CANDIDATS =====
# Index enrichissement par NOM+PRENOM (le N°Quad N'EST PAS unique dans cet Excel :
# un même quad peut désigner 2 personnes différentes). On préfère la fiche qui porte candidat_id.
cand_idx_n={}
for b in bk["secretariat_candidats"]:
    k=norm(b["nom"])+"|"+norm(b.get("prenom"))
    cur=cand_idx_n.get(k)
    if cur is None or (b.get("candidat_id") and not cur.get("candidat_id")):
        cand_idx_n[k]=b
def map_candidat(r,yr):
    mt=get(r,"Mission terminée"); mts=("" if mt in (None,MISS) else str(mt).strip())
    is_term=False; date_fin=None; archive=False
    if mts.upper()=="ARCHIVE": archive=True
    elif mts.lower()=="x": is_term=True
    elif parse_date(mts): is_term=True; date_fin=parse_date(mts)
    elif mts!="": ambigus.append(f"cand {yr} {r.get('Nom')} {r.get('Pénom')}: {mts!r}")
    q=s_or_none(get(r,"N°Quad")); nk=norm(get(r,"Nom"))+"|"+norm(get(r,"Pénom"))
    src=cand_idx_n.get(nk) or {}
    enf=get(r,"ENFANTS\nà charge"); enf=(None if enf in (None,MISS) or isdash(enf) else str(enf).strip().lower())
    dc=get(r,"DOCS clients")
    has_docs=(doc_bool(dc) if dc is not MISS else bool(src.get("has_docs_clients")))
    out={
      "numero_quadrigis":q,
      "nom":(s_or_none(get(r,"Nom")) or src.get("nom") or ""),
      "prenom":(s_or_none(get(r,"Pénom")) or ""),
      "enfants_charge":enf,
      "date_naissance":parse_date(get(r,"Date de naissance")) or src.get("date_naissance"),
      "lieu_demande":s_or_none(get(r,"Lieu de demande")),
      "genre_permis":s_or_none(get(r,"Genre permis")),
      "date_echeance_permis":parse_date(get(r,"Date échéance")),
      "permis_travail":s_or_none(get(r,"Permis de travail")),
      "carte_id":("" if isdash(get(r,"Carte ID")) else str(get(r,"Carte ID")).strip()),
      "numero_avs":("" if isdash(get(r,"N° AVS")) else str(get(r,"N° AVS")).strip()),
      "iban":("" if isdash(get(r,"IBAN")) else str(get(r,"IBAN")).strip()),
      "has_cv":doc_bool(get(r,"CV")),
      "has_cm":doc_bool(get(r,"CM")),
      "has_docs_clients":has_docs,
      "remarques":s_or_none(get(r,"Remarques / Manque")),
      "mappe":doc_bool(get(r,"MAPPE")),
      "docs_manquants":s_or_none(get(r,"Docs manquant")),
      "permis_note":s_or_none(get(r,"PERMIS")),
      "is_mission_terminee":is_term,
      "date_fin_mission":date_fin,
      "archive":archive,
      "archived_at":(src.get("archived_at") if (src.get("archive") and archive) else (now_iso() if archive else None)),
      "annee":yr,
      # champs preserves
      "candidat_id":src.get("candidat_id"),
      "couleur":src.get("couleur"),
      "mode_paiement":src.get("mode_paiement"),
      "suisse":bool(src.get("suisse")),
      "has_permis_conduire":bool(src.get("has_permis_conduire")),
      "type_demande":src.get("type_demande"),
      "date_demande":src.get("date_demande"),
      "date_mission":src.get("date_mission"),
    }
    if src.get("created_at"): out["created_at"]=src["created_at"]
    return out
xl_quads=set(); xl_names=set()
for sh in ["Candidats 2025","Candidats 2026"]:
    for r in rows_of(CF[sh]):
        q=s_or_none(get(r,"N°Quad"))
        if q: xl_quads.add(q)
        xl_names.add(norm(get(r,"Nom"))+"|"+norm(get(r,"Pénom")))
disappeared["candidats"]=[(b["nom"],b.get("prenom"),b.get("numero_quadrigis"),b["annee"]) for b in bk["secretariat_candidats"]
    if str(b.get("numero_quadrigis") or "").strip() not in xl_quads and (norm(b["nom"])+"|"+norm(b.get("prenom"))) not in xl_names]
for yr,sh in [(2025,"Candidats 2025"),(2026,"Candidats 2026")]:
    replace_year("secretariat_candidats",yr,[map_candidat(r,yr) for r in rows_of(CF[sh])])

# ===== ACCIDENTS =====
ALLOWED={"Accident","Maladie","Bagatelle","LCA Maladie"}
acc_link={}
for b in bk["secretariat_accidents"]:
    k=norm(b["nom_prenom"])
    if b.get("candidat_id"): acc_link.setdefault(k,b["candidat_id"])
def map_acc(r,yr):
    cas=s_or_none(get(r,"CAS")) or "Maladie"
    if cas not in ALLOWED: cas="Maladie"
    term=(str(get(r,"Terminé")).strip().lower()=="x")
    st=s_or_none(get(r,"Accident"))
    return {"nom_prenom":s_or_none(get(r,"Nom Pénom")) or "","type_cas":cas,
      "sous_type":(st if st in ("AANP","AAP") else None),"raison":s_or_none(get(r,"Raison")),
      "numero_sinistre":avs_norm(get(r,"N° sinistre")),"date_debut":parse_date(get(r,"Date de début")),
      "date_fin":parse_date(get(r,"Date de fin")),"assurance_payee_jusqu_au":parse_date(get(r,"Ass. Payé jusqu'au")),
      "licenciement_pour_le":parse_date(get(r,"Licenciement pour le")),"remarque":s_or_none(get(r,"Remarque")),
      "decision":s_or_none(get(r,"Décision")),"note":s_or_none(get(r,"Note")),"termine":term,
      "statut_cas":("termine" if term else "en_cours"),"couleur":"normal",
      "candidat_id":acc_link.get(norm(get(r,"Nom Pénom"))),"annee":yr}
for yr,sh in [(2025,"Accident-Maladie 2025"),(2026,"Accident-Maladie 2026")]:
    replace_year("secretariat_accidents",yr,[map_acc(r,yr) for r in rows_of(AF[sh])])

# ===== ALFA =====
alfa_link={}
for b in bk["secretariat_alfa"]:
    k=norm(b["nom"])+"|"+norm(b.get("prenom"))
    if k not in alfa_link: alfa_link[k]={"candidat_id":b.get("candidat_id"),"couleur":b.get("couleur"),"raf":b.get("raf")}
def map_alfa(r,yr):
    k=norm(get(r,"Nom"))+"|"+norm(get(r,"Pénom")); src=alfa_link.get(k,{})
    return {"nom":s_or_none(get(r,"Nom")) or "","prenom":s_or_none(get(r,"Pénom")),
      "numero_avs":avs_norm(get(r,"N° AVS")),"nbr_enfants":to_int(get(r,"Nbr. Enfants")),
      "montant_chf":to_num(get(r,"Montant\nCHF")),"bareme_is":s_or_none(get(r,"Barême IS")),
      "date_debut_alfa":parse_date(get(r,"Date \nDébut Alfa")),"date_fin_alfa":parse_date(get(r,"Date \nFin Alfa")),
      "date_radiation_caf":parse_date(get(r,"Date \nRadiation CAF")),"radiation_recue":s_or_none(get(r,"Radiation reçue")),
      "mere_touche":s_or_none(get(r,"La mère touche","l'autre touche")),"remarques":s_or_none(get(r,"Remarques")),
      "demande_envoyee":s_or_none(get(r,"Demande envoyée")),"reactivation_envoyee":s_or_none(get(r,"Réactivation envoyée")),
      "lieu_enfants":s_or_none(get(r,"Lieu enfants")),"consimo":s_or_none(get(r,"Consimo")),
      "termine":(str(get(r,"Demande -\nTerminé x")).strip().lower()=="x"),"raf":bool(src.get("raf")),
      "candidat_id":src.get("candidat_id"),"couleur":src.get("couleur"),"annee":yr}
for yr,sh in [(2025,"Alfa 2025"),(2026,"Alfa 2026")]:
    replace_year("secretariat_alfa",yr,[map_alfa(r,yr) for r in rows_of(CF[sh])])

# ===== ALFA A PAYER =====
pay_link={}
for b in bk["secretariat_alfa_paiements"]:
    if b.get("candidat_id"): pay_link.setdefault(norm(b["nom"]),b["candidat_id"])
def map_payer(r,yr):
    fin=parse_date(get(r,"Date\nFin de mission"))
    return {"nom":s_or_none(get(r,"Nom")) or "","prenom":s_or_none(get(r,"Pénom")),
      "numero_avs":avs_norm(get(r,"N° AVS")),"nbr_enfants":to_int(get(r,"Nbr. Enfants")),
      "date_validite_decision":parse_date(get(r,"Date validitée \ndécision")),"droit_chf_mois":to_num(get(r,"Droit CHF / mois")),
      "montant_alfa_paye":to_num(get(r,"Montant  ALFA payé\nCHF")),"annee_periode":s_or_none(get(r,"Année")),
      "alfa_dernier_mois":s_or_none(get(r,"ALFA \n dernier mois concerné")),"date_fin_mission":fin,
      "dates_fin_mission":(f"{fin}:0" if fin else None),"statut_termine":(str(get(r,"Statut\nx terminé")).strip().lower()=="x"),
      "dernier_mois_paye":s_or_none(get(r,"Dernier mois payé")),"prochain_mois_paye":s_or_none(get(r,"prochain mois payé")),
      "remarques":s_or_none(get(r,"Remarques")),"candidat_id":pay_link.get(norm(get(r,"Nom"))),"annee":yr}
for yr,sh in [(2025,"ALFA à payer - 2025"),(2026,"ALFA à payer - 2026")]:
    replace_year("secretariat_alfa_paiements",yr,[map_payer(r,yr) for r in rows_of(CF[sh])])

# ===== LOYERS ===== (annee derivee du mois)
loy_link={}
for b in bk["secretariat_loyers"]:
    loy_link.setdefault(norm(b["nom_prenom"]),b.get("couleur"))
def map_loyer(r):
    mois=s_or_none(get(r,"Mois")); yr=2025
    if mois:
        mm=re.search(r"(\d{4})",mois)
        if mm: yr=int(mm.group(1))
    return {"nom_prenom":s_or_none(get(r,"Candidat")) or "","mode_paiement":s_or_none(get(r,"Mode de paiement / Quad")),
      "hotel_auberge":s_or_none(get(r,"Hotel / Auberge")),"montant_loyer":to_num(get(r,"Prix")),"mois":mois,
      "date_deduction":parse_date(get(r,"Date \ndéduction")),"remarques":s_or_none(get(r,"Remarques")),
      "couleur":loy_link.get(norm(get(r,"Candidat"))),"annee":yr}
loyers=[map_loyer(r) for r in rows_of(CF["Loyer candidat"])]
for yr in sorted(set(x["annee"] for x in loyers)):
    replace_year("secretariat_loyers",yr,[x for x in loyers if x["annee"]==yr])

print("\n"+("="*70)); print("  "+("DRY-RUN (aucune écriture)" if DRY else "EXÉCUTION RÉELLE TERMINÉE")); print("="*70)
print(json.dumps(report,ensure_ascii=False,indent=1))
print(f"\nFiches qui DISPARAISSENT (résidus absents de l'Excel) ({len(disappeared['candidats'])} candidats):")
for x in disappeared["candidats"]: print("   -",x)
print(f"\nDates impossibles rejetées ({len(bad_dates)}): {bad_dates}")
print(f"Cas ambigus 'Mission terminée' ({len(ambigus)})")
