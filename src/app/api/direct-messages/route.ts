import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { decryptText, isEncrypted } from '@/lib/crypto'

// GET - Get or create direct message room between two users
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

    const { searchParams } = new URL(request.url)
    const otherUserId = searchParams.get('userId')

    if (!otherUserId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      )
    }

    // Check if direct message room already exists between these users
    const existingRoom = await prisma.room.findFirst({
      where: {
        isDirect: true,
        AND: [
          {
            members: {
              some: {
                userId: decoded.userId
              }
            }
          },
          {
            members: {
              some: {
                userId: otherUserId
              }
            }
          }
        ]
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                isOnline: true
              }
            }
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatar: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          },
          take: 50
        }
      }
    })

    if (existingRoom) {
      const room = {
        ...existingRoom,
        messages: existingRoom.messages.map(m => ({
          ...m,
          content: isEncrypted(m.content) ? decryptText(m.content) : m.content,
        }))
      }
      return NextResponse.json({ room })
    }

    // Create new direct message room
    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, username: true, avatar: true, isOnline: true }
    })

    if (!otherUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const newRoom = await prisma.room.create({
      data: {
        name: `Direct Message`,
        description: 'Direct message conversation',
        isDirect: true,
        isPrivate: true,
        creatorId: decoded.userId,
        members: {
          create: [
            { userId: decoded.userId },
            { userId: otherUserId }
          ]
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                isOnline: true
              }
            }
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatar: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    const room = {
      ...newRoom,
      messages: newRoom.messages.map(m => ({
        ...m,
        content: isEncrypted(m.content) ? decryptText(m.content) : m.content,
      }))
    }

    return NextResponse.json({ room })
  } catch (error) {
    console.error('Error in direct messages API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
