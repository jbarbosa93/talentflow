#!/usr/bin/env python3
# BACKUP COMPLET (lecture seule) des 7 tables secretariat_* -> ~/Desktop, horodaté.
import json, urllib.request, urllib.parse, datetime, os
env={}
for l in open("/Users/joaobarbosa/Dev/talentflow/.env.local"):
    l=l.strip()
    if not l or l.startswith("#") or "=" not in l: continue
    k,v=l.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
URL=env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); KEY=env["SUPABASE_SERVICE_ROLE_KEY"]
def fetch_all(t):
    u=f"{URL}/rest/v1/{t}?select=*&limit=10000"
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"apikey":KEY,"Authorization":f"Bearer {KEY}"})))
TABLES=["secretariat_candidats","secretariat_accidents","secretariat_alfa","secretariat_alfa_paiements","secretariat_loyers","secretariat_notifications","secretariat_paiement_calendrier"]
stamp=datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
backup={"_meta":{"created_at":datetime.datetime.now().isoformat(),"tables":{}}}
for t in TABLES:
    rows=fetch_all(t)
    backup[t]=rows
    backup["_meta"]["tables"][t]=len(rows)
    print(f"  {t}: {len(rows)} lignes")
path=os.path.expanduser(f"~/Desktop/backup_secretariat_{stamp}.json")
with open(path,"w") as f: json.dump(backup,f,ensure_ascii=False,indent=1,default=str)
# copie aussi dans le scratchpad pour le rollback
with open("backup_secretariat.json","w") as f: json.dump(backup,f,ensure_ascii=False,default=str)
print(f"\n✅ BACKUP -> {path}")
print(f"   ({os.path.getsize(path)} octets)")
