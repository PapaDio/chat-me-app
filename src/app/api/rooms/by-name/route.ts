import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name')
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const room = await prisma.room.findFirst({ where: { name } })
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    return NextResponse.json({ room: { id: room.id, name: room.name, createdAt: room.createdAt } })
  } catch (e) {
    console.error('by-name error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
