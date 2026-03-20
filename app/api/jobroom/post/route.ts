import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.JOBROOM_API_URL || 'https://api.job-room.ch/jobAdvertisements/v1'
const USERNAME = process.env.JOBROOM_USERNAME
const PASSWORD = process.env.JOBROOM_PASSWORD

export async function POST(req: NextRequest) {
  if (!USERNAME || !PASSWORD || USERNAME === 'votre_username') {
    return NextResponse.json({
      error: 'Job-Room non configuré. Contactez jobroom-api@seco.admin.ch pour obtenir vos credentials, puis ajoutez JOBROOM_USERNAME et JOBROOM_PASSWORD dans .env.local'
    }, { status: 400 })
  }

  const body = await req.json()
  const credentials = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json;charset=UTF-8',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.message || JSON.stringify(data) }, { status: res.status })
    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
