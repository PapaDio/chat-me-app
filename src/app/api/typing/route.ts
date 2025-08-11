import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getRedis } from '@/lib/redis'

// In-memory fallback typing store: roomId -> Map<userId, { username: string; ts: number }>
const typingStore: Map<string, Map<string, { username: string; ts: number }>> = new Map()
const TTL_MS = 5000

function prune(roomId: string) {
  const roomMap = typingStore.get(roomId)
  if (!roomMap) return
  const now = Date.now()
  for (const [uid, info] of roomMap.entries()) {
    if (now - info.ts > TTL_MS) roomMap.delete(uid)
  }
  if (roomMap.size === 0) typingStore.delete(roomId)
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.substring(7)
    const decoded = verifyToken(token)
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { roomId, isTyping, username } = await req.json()
    if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 })

    const redis = getRedis()
    const key = `typing:${roomId}:${decoded.userId}`
    const name = username || 'Someone'
    if (redis) {
      if (isTyping) {
        await redis.set(key, name, 'EX', Math.ceil(TTL_MS / 1000))
      } else {
        await redis.del(key)
      }
    } else {
      if (isTyping) {
        const roomMap = typingStore.get(roomId) || new Map()
        roomMap.set(decoded.userId, { username: name, ts: Date.now() })
        typingStore.set(roomId, roomMap)
      } else {
        const roomMap = typingStore.get(roomId)
        if (roomMap) {
          roomMap.delete(decoded.userId)
          if (roomMap.size === 0) typingStore.delete(roomId)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.substring(7)
    const decoded = verifyToken(token)
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const roomId = searchParams.get('roomId')
    if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 })

    const redis = getRedis()
    let users: string[] = []
    if (redis) {
      // Note: KEYS is acceptable here due to low cardinality. For larger scale, switch to SCAN.
      const allKeys = await redis.keys(`typing:${roomId}:*`)
      const keys = allKeys.filter((k: string) => !k.endsWith(`:${decoded.userId}`))
      if (keys.length > 0) {
        const values = await redis.mget(keys)
        users = values
          .filter((v: string | null): v is string => typeof v === 'string')
          .map((v: string) => v)
      }
      users = users.filter((u: string) => !!u)
    } else {
      prune(roomId)
      const roomMap = typingStore.get(roomId)
      const now = Date.now()
      users = roomMap
        ? Array.from(roomMap.entries())
            .filter(([uid, info]) => uid !== decoded.userId && now - info.ts <= TTL_MS)
            .map(([, info]) => info.username)
        : []
    }

    return NextResponse.json({ users })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
