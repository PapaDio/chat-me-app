import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Get token from Authorization header
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

    const { name, description, isPrivate } = await request.json()

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      )
    }

    if (name.trim().length > 50) {
      return NextResponse.json(
        { error: 'Room name must be 50 characters or less' },
        { status: 400 }
      )
    }

    if (description && description.length > 200) {
      return NextResponse.json(
        { error: 'Description must be 200 characters or less' },
        { status: 400 }
      )
    }

    // Check if room with same name already exists
    const existingRoom = await prisma.room.findFirst({
      where: {
        name: name.trim(),
      }
    })

    if (existingRoom) {
      return NextResponse.json(
        { error: 'A room with this name already exists' },
        { status: 409 }
      )
    }

    // Create the room
    const room = await prisma.room.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        isPrivate: Boolean(isPrivate),
        creatorId: decoded.userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            avatar: true,
          }
        },
        _count: {
          select: {
            members: true,
          }
        }
      }
    })

    // Add creator as a member of the room
    await prisma.roomMember.create({
      data: {
        userId: decoded.userId,
        roomId: room.id,
      }
    })

    // Add system message to the room
    await prisma.message.create({
      data: {
        content: `Room "${room.name}" created by ${room.creator.username}`,
        type: 'SYSTEM',
        senderId: decoded.userId,
        roomId: room.id,
      }
    })

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
        creator: room.creator,
        memberCount: room._count.members + 1, // +1 for the creator we just added
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Room creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
