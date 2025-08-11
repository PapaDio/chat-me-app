import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRedis } from '@/lib/redis'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
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

    // Try Redis cache first
    const redis = getRedis()
    const cacheKey = `rooms:list:${decoded.userId}`
    if (redis) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          return NextResponse.json(parsed)
        } catch {}
      }
    }

    // Get all rooms the user is a member of
    const userRooms = await prisma.roomMember.findMany({
      where: { userId: decoded.userId },
      include: {
        room: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true
                  }
                }
              }
            },
            _count: {
              select: { members: true }
            }
          }
        }
      }
    })

    type MemberRoomShape = {
      room: {
        id: string
        name: string
        description: string | null
        isPrivate: boolean
        createdAt: Date
        updatedAt: Date
        _count: { members: number }
      }
    }
    const memberRooms = userRooms.map((ur: MemberRoomShape) => ({
      ...ur.room,
      memberCount: ur.room._count.members,
      isMember: true,
    }))

    // Also get public rooms the user is not a member of
    const publicRooms = await prisma.room.findMany({
      where: {
        isPrivate: false,
        NOT: {
          members: {
            some: {
              userId: decoded.userId
            }
          }
        }
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
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 10 // Limit to 10 public rooms
    })

    type PublicRoomShape = {
      id: string
      name: string
      description: string | null
      isPrivate: boolean
      createdAt: Date
      updatedAt: Date
      creator: { id: string; username: string; avatar: string | null } | null
      _count: { members: number }
    }
    const availableRooms = publicRooms.map((room: PublicRoomShape) => ({
      id: room.id,
      name: room.name,
      description: room.description ?? undefined,
      isPrivate: room.isPrivate,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      creator: room.creator ?? undefined,
      memberCount: room._count.members,
      isMember: false,
    }))

    const payload = { memberRooms, availableRooms }

    // Store in Redis with short TTL
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', 15)
    }

    return NextResponse.json(payload)

  } catch (error) {
    console.error('Rooms fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
