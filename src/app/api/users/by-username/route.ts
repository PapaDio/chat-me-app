import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const username = searchParams.get('username')
    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Return minimal safe fields
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        avatar: (user as any).avatar || null,
      }
    })
  } catch (e) {
    console.error('by-username error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
