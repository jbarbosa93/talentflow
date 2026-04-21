#!/usr/bin/env node
// scripts/setup-seb-signature.mjs
//
// v1.9.68 — Configure la signature email de Sébastien D'Agostino :
// 1. Upload public/avatars/seb.jpg → Supabase Storage bucket `public-assets/photos/sebastien.jpg`
// 2. Génère la signature HTML (clone de la signature de João, photo + LinkedIn + natel adaptés)
// 3. Met à jour auth.users.raw_user_meta_data.signature_html pour s.dagostino@l-agence.ch
//
// Idempotent : peut être re-joué, l'upload écrase la photo existante, l'update remplace la sig.
//
// Usage : node --env-file=.env.local scripts/setup-seb-signature.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const EMAIL = 's.dagostino@l-agence.ch'
const PHOTO_LOCAL = 'public/avatars/seb.jpg'
const PHOTO_PATH = 'photos/sebastien.jpg'
const LINKEDIN = 'https://www.linkedin.com/in/sebastiendagostino/'
const MOBILE = '+41 79 219 16 88'
const BUREAU = '+41 24 552 18 70'

// ─── 1. Upload photo ──────────────────────────────────────────────────────────
console.log('📸 Upload photo →', PHOTO_PATH)
const buffer = readFileSync(join(process.cwd(), PHOTO_LOCAL))
const { error: uploadErr } = await admin.storage
  .from('public-assets')
  .upload(PHOTO_PATH, buffer, { contentType: 'image/jpeg', upsert: true })
if (uploadErr) {
  console.error('❌ Upload error:', uploadErr.message)
  process.exit(1)
}
const { data: urlData } = admin.storage.from('public-assets').getPublicUrl(PHOTO_PATH)
const PHOTO_URL = urlData.publicUrl
console.log('   ✅', PHOTO_URL)

// ─── 2. Génère la signature HTML ──────────────────────────────────────────────
const signature = `<div style="font-family:Arial,sans-serif;color:rgb(68,68,68)">
<p style="text-align:left;line-height:normal;margin:0"><span style="font-family:Aptos,Arial,Helvetica,sans-serif;font-size:12pt;color:rgb(0,0,0)">Je reste à disposition pour toutes questions.</span></p>
<p style="margin:0"><br></p>
<p style="text-align:left;line-height:normal;margin:0"><span style="font-family:Aptos,Arial,Helvetica,sans-serif;font-size:12pt;color:rgb(0,0,0)">Cordialement,</span></p>
<p style="margin:0"><br></p>
<table cellspacing="0" cellpadding="0" border="0" style="width:480px;color:rgb(68,68,68);border-collapse:collapse;border-spacing:0">
  <tbody>
    <tr>
      <td style="border-right:1px solid rgb(0,0,0);vertical-align:top;width:142px">
        <img src="${PHOTO_URL}" alt="Sébastien D'Agostino" width="117" style="width:117px;height:auto;max-width:100%">
      </td>
      <td style="width:25px"></td>
      <td style="width:313px;vertical-align:top">
        <div style="color:rgb(0,0,0)">
          <span style="font-family:&quot;Arial Black&quot;,Arial,sans-serif;font-size:16pt;background-color:rgb(255,255,0)"><b>Sébastien D'Agostino</b></span><br>
          <span style="font-family:Arial,sans-serif;font-size:11pt;line-height:15px">Consultant</span>
        </div>
        <p style="line-height:15px;margin:0;padding-top:10px">
          <span style="font-family:Arial,sans-serif;font-size:11pt;color:rgb(0,0,0);font-weight:700">Bureau:</span>
          <span style="font-family:Arial,sans-serif;font-size:11pt;color:rgb(0,0,0)">&nbsp;${BUREAU}</span>
        </p>
        <p style="line-height:15px;margin:0;padding-top:10px">
          <span style="font-family:Arial,sans-serif;font-size:11pt;color:rgb(0,0,0);font-weight:700">Mobile :</span>
          <span style="font-family:Arial,sans-serif;font-size:11pt;color:rgb(0,0,0)">&nbsp;${MOBILE}</span>
          <br><br>
          <span style="font-family:Arial,sans-serif;font-size:11pt;color:rgb(0,0,0)">Avenue des Alpes 3&nbsp;|&nbsp;CH - 1870 Monthey</span>
        </p>
        <p style="line-height:15px;margin:10px 0 0">
          <a href="https://www.facebook.com/LAGENCESA?locale=fr_FR" rel="noopener" style="text-decoration:none"><img src="https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/public/public-assets/icons/fb.png" alt="Facebook" width="15" height="15" style="width:15px;height:15px;vertical-align:middle"></a>
          &nbsp;&nbsp;
          <a href="${LINKEDIN}" rel="noopener" style="text-decoration:none"><img src="https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/public/public-assets/icons/ln.png" alt="LinkedIn" width="16" height="16" style="width:16px;height:16px;vertical-align:middle"></a>
          &nbsp;&nbsp;
          <a href="https://www.instagram.com/l_agence_monthey/" rel="noopener" style="text-decoration:none"><img src="https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/public/public-assets/icons/ig.png" alt="Instagram" width="16" height="16" style="width:16px;height:16px;vertical-align:middle"></a>
        </p>
      </td>
    </tr>
    <tr>
      <td colspan="3" style="padding-top:18px">
        <a href="https://l-agence.ch/" rel="noopener" style="text-decoration:none">
          <img src="https://rdpbqnhwhjkngxxitupg.supabase.co/storage/v1/object/public/public-assets/logos/banner-lagence.png" alt="L-AGENCE SA" width="480" style="width:480px;height:auto;max-width:100%;display:block">
        </a>
      </td>
    </tr>
  </tbody>
</table>
</div>`

// ─── 3. Update user_metadata ──────────────────────────────────────────────────
console.log('🔎 Recherche utilisateur', EMAIL)
const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 })
if (listErr) {
  console.error('❌ listUsers error:', listErr.message)
  process.exit(1)
}
const user = usersList.users.find(u => u.email === EMAIL)
if (!user) {
  console.error('❌ Utilisateur non trouvé :', EMAIL)
  process.exit(1)
}
console.log('   ✅ user_id =', user.id)

const newMeta = { ...(user.user_metadata || {}), signature_html: signature }
const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { user_metadata: newMeta })
if (updateErr) {
  console.error('❌ updateUser error:', updateErr.message)
  process.exit(1)
}

console.log('✅ Signature mise à jour pour', EMAIL)
console.log('   Longueur HTML :', signature.length, 'chars')
console.log('\nSeb doit se déconnecter/reconnecter pour récupérer la nouvelle signature.')
