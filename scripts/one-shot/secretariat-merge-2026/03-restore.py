#!/usr/bin/env python3
# RESTAURATION des 5 tables data depuis le backup pris avant merge. Etat exact d'origine.
import json, urllib.request, urllib.error
env={}
for l in open("/Users/joaobarbosa/Dev/talentflow/.env.local"):
    l=l.strip()
    if not l or l.startswith("#") or "=" not in l: continue
    k,v=l.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
URL=env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); KEY=env["SUPABASE_SERVICE_ROLE_KEY"]
HD={"apikey":KEY,"Authorization":f"Bearer {KEY}","Content-Type":"application/json"}
def http(method,path,body=None,prefer="return=minimal"):
    data=json.dumps(body).encode() if body is not None else None
    h=dict(HD); h["Prefer"]=prefer
    req=urllib.request.Request(URL+path,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(req) as r:
            t=r.read().decode(); return r.status,(json.loads(t) if t.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code,e.read().decode()

bk=json.load(open("backup_secretariat.json"))
TABLES=["secretariat_candidats","secretariat_accidents","secretariat_alfa","secretariat_alfa_paiements","secretariat_loyers"]
for t in TABLES:
    rows=bk[t]
    # purge totale
    st,_=http("DELETE",f"/rest/v1/{t}?id=not.is.null")
    # re-insert par lots de 100 (avec ids/created_at d'origine)
    ok=0; err=0
    for i in range(0,len(rows),100):
        st,resp=http("POST",f"/rest/v1/{t}",rows[i:i+100])
        if st>=300: err+=1; print("  ERR",t,st,str(resp)[:200])
        else: ok+=len(rows[i:i+100])
    print(f"  {t}: restauré {ok} lignes (attendu {len(rows)})")
print("✅ Restauration terminée")
