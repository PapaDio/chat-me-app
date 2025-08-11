import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { randomUUID } from 'crypto'

// POST - Mark messages as read for a room up to a given messageId (inclusive)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { roomId, upToMessageId } = await request.json()
    if (!roomId) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 })
    }

    // Ensure the user is a member of the room (or it's their LLM room)
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        OR: [
          { members: { some: { userId: decoded.userId } } },
          { isDirect: true },
        ],
      },
      select: { id: true },
    })
    if (!room) {
      return NextResponse.json({ error: 'Room not found or access denied' }, { status: 404 })
    }

    // If upToMessageId is provided, look up its createdAt for inclusive bound
    let boundDate: Date | undefined
    if (upToMessageId) {
      const boundMsg = await prisma.message.findUnique({ where: { id: upToMessageId }, select: { createdAt: true } })
      boundDate = boundMsg?.createdAt
    }

    // Find messages in room sent by others and not yet marked read by this user
    const messagesToMark = await prisma.message.findMany({
      where: {
        roomId,
        senderId: { not: decoded.userId },
        ...(boundDate ? { createdAt: { lte: boundDate } } : {}),
      },
      select: { id: true },
      take: 200,
    })

    if (messagesToMark.length === 0) {
      return NextResponse.json({ success: true, marked: 0 })
    }

    // Create read records for those that don't exist using raw SQL (SQLite)
    let created = 0
    for (const m of messagesToMark) {
      // INSERT OR IGNORE respects the unique(messageId, userId)
      const res = await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO message_reads (id, messageId, userId, readAt) VALUES (?, ?, ?, datetime('now'))`,
        randomUUID(),
        m.id,
        decoded.userId
      )
      if (typeof res === 'number' && res > 0) created += res
    }

    return NextResponse.json({ success: true, marked: created })
  } catch (error) {
    console.error('Error marking messages as read:', error)
    return NextResponse.json({ error: 'Failed to mark messages as read' }, { status: 500 })
  }
}
