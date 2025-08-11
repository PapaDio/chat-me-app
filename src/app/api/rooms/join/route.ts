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

    const { roomId } = await request.json()

    if (!roomId) {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      )
    }

    // Check if room exists
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            avatar: true,
          }
        }
      }
    })

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      )
    }

    // Check if user is already a member
    const existingMembership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: decoded.userId,
          roomId: roomId,
        }
      }
    })

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this room' },
        { status: 409 }
      )
    }

    // For private rooms, only allow joining if invited (for now, we'll skip invitation logic)
    if (room.isPrivate) {
      return NextResponse.json(
        { error: 'Cannot join private room without invitation' },
        { status: 403 }
      )
    }

    // Add user to room
    await prisma.roomMember.create({
      data: {
        userId: decoded.userId,
        roomId: roomId,
      }
    })

    // Get user info for system message
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        username: true,
      }
    })

    // Add system message
    await prisma.message.create({
      data: {
        content: `${user?.username} joined the room`,
        type: 'SYSTEM',
        senderId: decoded.userId,
        roomId: roomId,
      }
    })

    return NextResponse.json({
      message: 'Successfully joined room',
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.isPrivate,
        creator: room.creator,
      }
    })

  } catch (error) {
    console.error('Room join error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
