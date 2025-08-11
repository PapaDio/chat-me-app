import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'
import { decryptText, encryptText, isEncrypted } from '@/lib/crypto'

// GET - Fetch messages for a room
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('roomId')
    const lastMessageId = searchParams.get('lastMessageId')

    if (!roomId) {
      return NextResponse.json({ error: 'Room ID is required' }, { status: 400 })
    }

    // Build typed findMany args using the Prisma client's method signature
    const args: NonNullable<Parameters<typeof prisma.message.findMany>[0]> = {
      where: {
        roomId,
        ...(lastMessageId ? { id: { gt: lastMessageId } } : {}),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50, // Limit to last 50 messages
    }

    const messages = await prisma.message.findMany(args)
    // Decrypt message content before returning to client
    const safe = messages.map((m) => ({
      ...m,
      content: isEncrypted(m.content) ? decryptText(m.content) : m.content,
    }))

    return NextResponse.json({ messages: safe })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

// POST - Send a new message
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }

    const body = await request.json()
    const { content, roomId, type = 'TEXT' } = body

    if (!content || !roomId) {
      return NextResponse.json({ error: 'Content and room ID are required' }, { status: 400 })
    }

    // Create the message (encrypt content at rest)
    const message = await prisma.message.create({
      data: {
        content: isEncrypted(content) ? content : encryptText(content),
        type,
        roomId,
        senderId: decoded.userId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    })

    // Return decrypted content to client
    const safe = {
      ...message,
      content: isEncrypted(message.content) ? decryptText(message.content) : message.content,
    }
    return NextResponse.json({ message: safe })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
