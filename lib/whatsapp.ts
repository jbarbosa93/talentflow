// lib/whatsapp.ts
// Wrapper WhatsApp Business API (Meta Cloud API)
// Vars requises : WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN

const WHATSAPP_API_VERSION = 'v21.0'
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`

function getPhoneId(): string {
  const id = process.env.WHATSAPP_PHONE_ID
  if (!id) throw new Error('WHATSAPP_PHONE_ID manquant dans .env.local')
  return id
}

function getToken(): string {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('WHATSAPP_TOKEN manquant dans .env.local')
  return token
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppTextMessage {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'text'
  text: { body: string; preview_url?: boolean }
}

export interface WhatsAppTemplateMessage {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components?: Array<{
      type: 'body' | 'header' | 'button'
      parameters: Array<{ type: 'text'; text: string }>
    }>
  }
}

export interface WhatsAppIncomingMessage {
  from: string          // Numéro expéditeur (format international sans +)
  id: string            // ID du message
  timestamp: string
  type: 'text' | 'image' | 'document' | 'audio' | 'video'
  text?: { body: string }
  image?: { id: string; caption?: string }
  document?: { id: string; filename: string; caption?: string }
}

export interface WhatsAppSendResult {
  messages: Array<{ id: string }>
  contacts: Array<{ input: string; wa_id: string }>
}

// ─── Vérification webhook (challenge Meta) ───────────────────────────────────

export function verifierWebhook(params: URLSearchParams): string | null {
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!verifyToken) throw new Error('WHATSAPP_VERIFY_TOKEN manquant dans .env.local')

  if (mode === 'subscribe' && token === verifyToken) {
    return challenge
  }
  return null
}

// ─── Envoi de messages ────────────────────────────────────────────────────────

async function appelAPI(phoneId: string, token: string, body: object): Promise<WhatsAppSendResult> {
  const response = await fetch(`${WHATSAPP_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (!response.ok) {
    const errMsg = data?.error?.message || `HTTP ${response.status}`
    throw new Error(`WhatsApp API : ${errMsg}`)
  }

  return data as WhatsAppSendResult
}

export async function envoyerMessage(
  telephone: string,
  texte: string
): Promise<WhatsAppSendResult> {
  const phoneId = getPhoneId()
  const token = getToken()

  // Normaliser le numéro (supprimer +, espaces, tirets)
  const numero = telephone.replace(/[\s+\-()]/g, '')

  const message: WhatsAppTextMessage = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: numero,
    type: 'text',
    text: { body: texte, preview_url: false },
  }

  return appelAPI(phoneId, token, message)
}

export async function envoyerTemplate(
  telephone: string,
  templateName: string,
  languageCode = 'fr',
  parametres: string[] = []
): Promise<WhatsAppSendResult> {
  const phoneId = getPhoneId()
  const token = getToken()

  const numero = telephone.replace(/[\s+\-()]/g, '')

  const message: WhatsAppTemplateMessage = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: numero,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: parametres.length > 0
        ? [{
            type: 'body',
            parameters: parametres.map(p => ({ type: 'text', text: p })),
          }]
        : undefined,
    },
  }

  return appelAPI(phoneId, token, message)
}

// ─── Marquer message comme lu ─────────────────────────────────────────────────

export async function marquerCommeLu(messageId: string): Promise<void> {
  const phoneId = getPhoneId()
  const token = getToken()

  await fetch(`${WHATSAPP_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  })
}

// ─── Parser le payload webhook entrant ────────────────────────────────────────

export function parserWebhook(body: Record<string, unknown>): WhatsAppIncomingMessage[] {
  const messages: WhatsAppIncomingMessage[] = []

  try {
    const entry = (body?.entry as any[])?.[0]
    const changes = entry?.changes as any[]

    for (const change of changes || []) {
      const msgs = change?.value?.messages as any[]
      for (const msg of msgs || []) {
        messages.push(msg as WhatsAppIncomingMessage)
      }
    }
  } catch {
    // payload mal formé → retourner tableau vide
  }

  return messages
}
