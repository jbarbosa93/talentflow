#!/usr/bin/env python3
"""
Convertit en PDF tous les CVs non-PDF du bucket `cvs` Supabase.

Cibles attendues (~506 candidats) :
  - 196 DOCX, 16 DOC   -> LibreOffice headless
  - 177 JPG, 61 JPEG, 56 PNG -> img2pdf

Usage:
  python scripts/one-shot/convert_cvs_to_pdf.py            # dry-run (par défaut)
  python scripts/one-shot/convert_cvs_to_pdf.py --run      # exécute réellement
  python scripts/one-shot/convert_cvs_to_pdf.py --run --limit 5
  python scripts/one-shot/convert_cvs_to_pdf.py --run --only docx
  python scripts/one-shot/convert_cvs_to_pdf.py --run --only image
  python scripts/one-shot/convert_cvs_to_pdf.py --run --id <candidat_id>

Dépendances Python:
  pip install supabase img2pdf pillow tqdm python-dotenv requests

Dépendance système (DOCX/DOC):
  brew install --cask libreoffice

Sécurité:
  - Ne supprime PAS l'ancien fichier (sécurité)
  - Met à jour cv_url uniquement après upload PDF réussi
  - Garde une trace de l'ancien cv_url dans le log JSON
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, unquote

import requests
from dotenv import load_dotenv
from tqdm import tqdm

try:
    import img2pdf
except ImportError:
    print("ERREUR: pip install img2pdf", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("ERREUR: pip install pillow", file=sys.stderr)
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print("ERREUR: pip install supabase", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env.local"
LOG_DIR = ROOT / "scripts" / "one-shot" / "logs"
BUCKET = "cvs"

IMAGE_EXTS = {"jpg", "jpeg", "png"}
OFFICE_EXTS = {"docx", "doc"}
ALL_EXTS = IMAGE_EXTS | OFFICE_EXTS


def find_soffice() -> Optional[str]:
    for candidate in [
        "soffice",
        "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/local/bin/soffice",
        "/opt/homebrew/bin/soffice",
    ]:
        path = shutil.which(candidate) if "/" not in candidate else (candidate if Path(candidate).exists() else None)
        if path:
            return path
    return None


def extract_storage_path(cv_url: str) -> Optional[str]:
    """
    Extrait le path interne au bucket depuis une URL Supabase Storage.

    Supporte:
      .../storage/v1/object/sign/cvs/<path>?token=...
      .../storage/v1/object/public/cvs/<path>
      .../storage/v1/object/cvs/<path>
    """
    if not cv_url:
        return None
    parsed = urlparse(cv_url)
    path = unquote(parsed.path)
    m = re.search(rf"/object/(?:sign/|public/)?{re.escape(BUCKET)}/(.+)$", path)
    if not m:
        return None
    return m.group(1)


def ext_from_path(path: str) -> str:
    return path.rsplit(".", 1)[-1].lower() if "." in path else ""


def download_from_storage(supabase: Client, storage_path: str) -> bytes:
    """Téléchargement direct via service role (bypasse signed URL expirée)."""
    return supabase.storage.from_(BUCKET).download(storage_path)


def convert_image_to_pdf(data: bytes, ext: str) -> bytes:
    """JPG/JPEG/PNG -> PDF via img2pdf. PNG avec alpha aplati au préalable."""
    if ext == "png":
        with Image.open(io.BytesIO(data)) as im:
            if im.mode in ("RGBA", "LA", "P"):
                bg = Image.new("RGB", im.size, (255, 255, 255))
                rgba = im.convert("RGBA")
                bg.paste(rgba, mask=rgba.split()[-1])
                buf = io.BytesIO()
                bg.save(buf, format="JPEG", quality=92)
                data = buf.getvalue()
            else:
                buf = io.BytesIO()
                im.convert("RGB").save(buf, format="JPEG", quality=92)
                data = buf.getvalue()
    elif ext in ("jpg", "jpeg"):
        # Re-encode pour normaliser EXIF orientation (img2pdf ignore EXIF)
        with Image.open(io.BytesIO(data)) as im:
            try:
                from PIL import ImageOps
                im = ImageOps.exif_transpose(im)
            except Exception:
                pass
            buf = io.BytesIO()
            im.convert("RGB").save(buf, format="JPEG", quality=92)
            data = buf.getvalue()
    return img2pdf.convert(data)


def convert_office_to_pdf(data: bytes, ext: str, soffice: str) -> bytes:
    """DOCX/DOC -> PDF via LibreOffice headless. Profil utilisateur temporaire pour parallélisme safe."""
    with tempfile.TemporaryDirectory(prefix="lo_conv_") as tmp:
        src = Path(tmp) / f"input.{ext}"
        src.write_bytes(data)
        profile = Path(tmp) / "lo_profile"
        cmd = [
            soffice,
            "--headless",
            "--nologo",
            "--nofirststartwizard",
            f"-env:UserInstallation=file://{profile}",
            "--convert-to", "pdf",
            "--outdir", tmp,
            str(src),
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=120)
        except subprocess.TimeoutExpired:
            raise RuntimeError("LibreOffice timeout (120s)")
        if result.returncode != 0:
            raise RuntimeError(f"LibreOffice rc={result.returncode}: {result.stderr.decode('utf-8', 'ignore')[:500]}")
        out = Path(tmp) / "input.pdf"
        if not out.exists():
            raise RuntimeError(f"PDF non généré. stdout={result.stdout.decode('utf-8','ignore')[:300]}")
        return out.read_bytes()


def upload_pdf(supabase: Client, target_path: str, pdf_bytes: bytes) -> None:
    """Upload PDF dans le bucket. upsert=true au cas où une tentative précédente a échoué après upload."""
    supabase.storage.from_(BUCKET).upload(
        path=target_path,
        file=pdf_bytes,
        file_options={
            "content-type": "application/pdf",
            "upsert": "true",
            "cache-control": "3600",
        },
    )


SIGNED_URL_TTL_SECONDS = 315_360_000  # 10 ans (≈ permanent)


def create_signed_cv_url(supabase: Client, storage_path: str) -> str:
    """
    Génère une signed URL longue durée (10 ans) pour le CV.
    Cohérent avec le reste de l'app TalentFlow qui stocke des signed URLs en DB.
    """
    res = supabase.storage.from_(BUCKET).create_signed_url(storage_path, SIGNED_URL_TTL_SECONDS)
    # Le SDK Python renvoie selon les versions: {"signedURL": "..."} ou {"signedUrl": "..."} ou {"signed_url": "..."}
    url = res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    if not url:
        raise RuntimeError(f"create_signed_url: clé signedURL absente, réponse={res}")
    # Certaines versions renvoient un path relatif "/storage/v1/..." → préfixer
    if url.startswith("/"):
        base = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
        url = f"{base}{url}"
    return url


def new_storage_path(old_path: str) -> str:
    """Remplace l'extension par .pdf (préserve le prefix complet du chemin)."""
    if "." in old_path.rsplit("/", 1)[-1]:
        return old_path.rsplit(".", 1)[0] + ".pdf"
    return old_path + ".pdf"


def update_candidat_cv(supabase: Client, candidat_id: str, new_url: str, new_filename: str, sha256: str) -> None:
    supabase.table("candidats").update({
        "cv_url": new_url,
        "cv_nom_fichier": new_filename,
        "cv_sha256": sha256,
    }).eq("id", candidat_id).execute()


def fetch_targets(supabase: Client, only: Optional[str], limit: Optional[int], single_id: Optional[str]) -> list[dict]:
    """
    Récupère tous les candidats avec cv_url non-PDF.
    On charge par pages de 1000 pour contourner le default Supabase.
    """
    if single_id:
        res = supabase.table("candidats").select("id, cv_url, cv_nom_fichier, nom, prenom").eq("id", single_id).execute()
        return res.data or []

    all_rows: list[dict] = []
    page = 0
    page_size = 1000
    while True:
        q = supabase.table("candidats") \
            .select("id, cv_url, cv_nom_fichier, nom, prenom") \
            .not_.is_("cv_url", "null") \
            .range(page * page_size, (page + 1) * page_size - 1)
        res = q.execute()
        rows = res.data or []
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        page += 1

    targets = []
    for row in all_rows:
        url = row.get("cv_url") or ""
        storage_path = extract_storage_path(url)
        if not storage_path:
            continue
        ext = ext_from_path(storage_path)
        if ext == "pdf":
            continue
        if ext not in ALL_EXTS:
            continue
        if only == "image" and ext not in IMAGE_EXTS:
            continue
        if only == "docx" and ext not in OFFICE_EXTS:
            continue
        row["_storage_path"] = storage_path
        row["_ext"] = ext
        targets.append(row)

    if limit:
        targets = targets[:limit]
    return targets


def main() -> int:
    parser = argparse.ArgumentParser(description="Convertit les CVs non-PDF en PDF dans Supabase")
    parser.add_argument("--run", action="store_true", help="Exécute réellement (sinon dry-run)")
    parser.add_argument("--only", choices=["image", "docx"], help="Limite aux images ou aux docs Office")
    parser.add_argument("--limit", type=int, help="Limite le nombre de candidats traités")
    parser.add_argument("--id", dest="single_id", help="Traite un seul candidat (par id)")
    parser.add_argument("--no-progress", action="store_true", help="Désactive tqdm")
    args = parser.parse_args()

    dry_run = not args.run

    if not ENV_FILE.exists():
        print(f"ERREUR: {ENV_FILE} introuvable", file=sys.stderr)
        return 1
    load_dotenv(ENV_FILE)

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("ERREUR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local", file=sys.stderr)
        return 1

    soffice = find_soffice()
    needs_office = args.only != "image"
    if needs_office and not soffice:
        msg = "LibreOffice introuvable. Install: brew install --cask libreoffice"
        if not args.only:
            print(f"AVERTISSEMENT: {msg} — les DOCX/DOC seront SKIPPÉS.", file=sys.stderr)
        elif args.only == "docx":
            print(f"ERREUR: {msg}", file=sys.stderr)
            return 1

    supabase: Client = create_client(supabase_url, service_key)

    print(f"Mode: {'DRY-RUN' if dry_run else 'RUN'}")
    print(f"LibreOffice: {soffice or 'NON INSTALLÉ'}")
    print(f"Filtre: only={args.only or 'all'} limit={args.limit or '∞'} single={args.single_id or '-'}")
    print("Récupération des candidats...")

    targets = fetch_targets(supabase, args.only, args.limit, args.single_id)
    print(f"→ {len(targets)} candidats à convertir")

    # Stats par extension
    ext_counts: dict[str, int] = {}
    for t in targets:
        ext_counts[t["_ext"]] = ext_counts.get(t["_ext"], 0) + 1
    print(f"Répartition: {ext_counts}")

    if dry_run:
        print("\n--- DRY-RUN: échantillon (5 candidats) ---")
        for t in targets[:5]:
            print(f"  {t['id']} | {t.get('prenom','?')} {t.get('nom','?')} | {t['_storage_path']} ({t['_ext']})")
        print("\n--- Commandes à lancer dans l'ordre ---")
        if not soffice:
            print("  0. brew install --cask libreoffice   # requis pour DOCX/DOC")
        print("  1. python scripts/one-shot/convert_cvs_to_pdf.py --run --only image --limit 5")
        print("     # → smoke test sur 5 images, vérifier 1-2 fiches dans l'UI")
        print("  2. python scripts/one-shot/convert_cvs_to_pdf.py --run --only image")
        print(f"     # → batch complet images ({sum(ext_counts.get(e,0) for e in ('jpg','jpeg','png'))} candidats)")
        print("  3. python scripts/one-shot/convert_cvs_to_pdf.py --run --only docx --limit 5")
        print("     # → smoke test sur 5 docs Office (après brew install)")
        print("  4. python scripts/one-shot/convert_cvs_to_pdf.py --run --only docx")
        print(f"     # → batch complet Office ({sum(ext_counts.get(e,0) for e in ('docx','doc'))} candidats)")
        return 0

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"convert_cvs_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"

    started = time.monotonic()
    log: dict = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "filter": {"only": args.only, "limit": args.limit, "single_id": args.single_id},
        "total": len(targets),
        "entries": [],
    }

    iterator = targets if args.no_progress else tqdm(targets, desc="Conversion", unit="cv")

    counts = {"success": 0, "skipped": 0, "failed": 0}

    for row in iterator:
        cid = row["id"]
        ext = row["_ext"]
        old_path = row["_storage_path"]
        entry = {
            "id": cid,
            "nom": row.get("nom"),
            "prenom": row.get("prenom"),
            "ext_original": ext,
            "storage_path_original": old_path,
            "storage_path_pdf": None,
            "status": None,
            "error": None,
            "new_cv_url": None,
        }

        try:
            if ext in OFFICE_EXTS and not soffice:
                entry["status"] = "skipped"
                entry["error"] = "libreoffice_missing"
                counts["skipped"] += 1
                log["entries"].append(entry)
                continue

            data = download_from_storage(supabase, old_path)

            if ext in IMAGE_EXTS:
                pdf_bytes = convert_image_to_pdf(data, ext)
            elif ext in OFFICE_EXTS:
                pdf_bytes = convert_office_to_pdf(data, ext, soffice)
            else:
                entry["status"] = "skipped"
                entry["error"] = f"unsupported_ext_{ext}"
                counts["skipped"] += 1
                log["entries"].append(entry)
                continue

            new_path = new_storage_path(old_path)
            entry["storage_path_pdf"] = new_path

            upload_pdf(supabase, new_path, pdf_bytes)

            sha256 = hashlib.sha256(pdf_bytes).hexdigest()
            new_url = create_signed_cv_url(supabase, new_path)
            old_filename = row.get("cv_nom_fichier") or old_path.rsplit("/", 1)[-1]
            base_name = old_filename.rsplit(".", 1)[0] if "." in old_filename else old_filename
            new_filename = base_name + ".pdf"

            update_candidat_cv(supabase, cid, new_url, new_filename, sha256)
            entry["sha256"] = sha256

            entry["status"] = "success"
            entry["new_cv_url"] = new_url
            counts["success"] += 1
            log["entries"].append(entry)

        except Exception as e:
            entry["status"] = "failed"
            entry["error"] = f"{type(e).__name__}: {e}"
            counts["failed"] += 1
            log["entries"].append(entry)

    duration = time.monotonic() - started
    log["ended_at"] = datetime.now(timezone.utc).isoformat()
    log["duration_seconds"] = round(duration, 2)
    log["counts"] = counts

    log_path.write_text(json.dumps(log, indent=2, ensure_ascii=False))

    mins, secs = divmod(int(duration), 60)
    hours, mins = divmod(mins, 60)
    duration_str = f"{hours}h{mins:02d}m{secs:02d}s" if hours else f"{mins}m{secs:02d}s"

    print()
    print("━" * 50)
    print(f"Total traités : {len(targets)}")
    print(f"✅ Réussis    : {counts['success']}")
    print(f"❌ Échoués    : {counts['failed']}")
    print(f"⏭  Skippés    : {counts['skipped']}")
    print(f"⏱  Durée      : {duration_str}")
    print(f"📄 Log        : {log_path}")
    print("━" * 50)

    return 0 if counts["failed"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
