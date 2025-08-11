import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRedis } from '@/lib/redis'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Try Redis cache first
    const redis = getRedis()
    const cacheKey = `unread:user:${decoded.userId}`
    if (redis) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          return NextResponse.json(parsed)
        } catch {}
      }
    }

    // Find direct message rooms the user is part of
    const dmRooms = await prisma.room.findMany({
      where: {
        isDirect: true,
        members: { some: { userId: decoded.userId } },
      },
      include: {
        members: true,
      },
    })

    const unreadByUser: Record<string, number> = {}

    // For each DM room, count unread via raw SQL to avoid client type mismatches
    for (const room of dmRooms) {
      const otherMember = room.members.find(m => m.userId !== decoded.userId)
      if (!otherMember) continue

      const rows = await prisma.$queryRaw<[{ c: number }]>`
        SELECT COUNT(*) as c
        FROM messages m
        LEFT JOIN message_reads r
          ON r.messageId = m.id AND r.userId = ${decoded.userId}
        WHERE m.roomId = ${room.id}
          AND m.senderId = ${otherMember.userId}
          AND r.id IS NULL
      `
      const count = Number((rows?.[0]?.c) ?? 0)
      unreadByUser[otherMember.userId] = count
    }

    const payload = { unreadCounts: unreadByUser }
    if (redis) {
      // Short TTL since this changes often
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', 10)
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching unread messages:', error)
    return NextResponse.json({ error: 'Failed to fetch unread messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Mark all unread messages from this user in their DM room as read
    const room = await prisma.room.findFirst({
      where: {
        isDirect: true,
        members: {
          every: {
            OR: [
              { userId: decoded.userId },
              { userId: userId },
            ],
          },
        },
      },
      select: { id: true },
    })

    if (!room) return NextResponse.json({ success: true })

    // Use raw SQL to select unread message IDs to avoid relying on 'reads' relation typing
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT m.id
      FROM messages m
      LEFT JOIN message_reads r
        ON r.messageId = m.id AND r.userId = ${decoded.userId}
      WHERE m.roomId = ${room.id}
        AND m.senderId = ${userId}
        AND r.id IS NULL
      LIMIT 200
    `
    const messages = rows.map(r => ({ id: r.id }))

    if (messages.length > 0) {
      for (const m of messages) {
        await prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO message_reads (id, messageId, userId, readAt) VALUES (?, ?, ?, datetime('now'))`,
          randomUUID(),
          m.id,
          decoded.userId
        )
      }
    }

    // Invalidate unread cache for this user
    const redis = getRedis()
    if (redis) {
      const cacheKey = `unread:user:${decoded.userId}`
      await redis.del(cacheKey)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking messages as read:', error)
    return NextResponse.json({ error: 'Failed to mark messages as read' }, { status: 500 })
  }
}
