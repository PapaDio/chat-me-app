import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// GET - Get all online users
export async function GET() {
  try {
    const cutoff = new Date(Date.now() - 60 * 1000) // 60 seconds

    // Mark users stale beyond cutoff as offline (best-effort cleanup)
    await prisma.user.updateMany({
      where: {
        isOnline: true,
        lastSeen: { lt: cutoff },
      },
      data: { isOnline: false },
    })

    const onlineUsers = await prisma.user.findMany({
      where: { isOnline: true, lastSeen: { gte: cutoff } },
      select: {
        id: true,
        username: true,
        avatar: true,
        isOnline: true,
      },
    })

    return NextResponse.json({ users: onlineUsers })
  } catch (error) {
    console.error('Error fetching online users:', error)
    return NextResponse.json({ error: 'Failed to fetch online users' }, { status: 500 })
  }
}

// POST - Update user online status
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { isOnline } = body

    // Update user online status
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { isOnline, lastSeen: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating user status:', error)
    return NextResponse.json({ error: 'Failed to update user status' }, { status: 500 })
  }
}
