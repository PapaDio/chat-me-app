import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      )
    }

    const userId = decoded.userId

    // Ensure AI Assistant user exists
    const aiUsername = 'AI Assistant'
    const aiEmail = 'ai-assistant@local'
    let aiUser = await prisma.user.findFirst({ where: { username: aiUsername } })
    if (!aiUser) {
      aiUser = await prisma.user.create({
        data: {
          username: aiUsername,
          email: aiEmail,
          password: 'disabled-ai-account',
          avatar: '',
          isOnline: false,
        },
      })
    }

    // Find or create private LLM room for this user
    let llmRoom = await prisma.room.findFirst({
      where: {
        name: `LLM Chat - ${userId}`,
        isPrivate: true,
        isDirect: false,
      },
      include: {
        _count: { select: { members: true } },
      },
    })

    if (!llmRoom) {
      llmRoom = await prisma.room.create({
        data: {
          name: `LLM Chat - ${userId}`,
          description: 'Chat with AI Assistant',
          isPrivate: true,
          isDirect: false,
          creatorId: userId,
          members: { create: [{ userId }] },
        },
        include: {
          _count: { select: { members: true } },
        },
      })
    }

    const room = {
      id: llmRoom.id,
      name: llmRoom.name,
      description: llmRoom.description ?? undefined,
      isPrivate: llmRoom.isPrivate,
      isMember: true,
      memberCount: llmRoom._count?.members ?? 1,
      createdAt: llmRoom.createdAt.toISOString(),
    }

    return NextResponse.json({ room })
  } catch (error) {
    console.error('LLM room error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
