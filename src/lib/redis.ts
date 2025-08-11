import type { Redis as IORedis } from 'ioredis'

let redis: IORedis | null = null
let initializing: Promise<void> | null = null

export function getRedis(): IORedis | null {
  if (redis !== null) return redis
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL
  if (!url) return null
  // Lazily load via dynamic import to avoid build failures if dependency is optional.
  // Keep this function synchronous: kick off initialization and return null until ready.
  if (!initializing) {
    type RedisCtor = new (url: string) => IORedis
    initializing = import('ioredis')
      .then(mod => {
        const RedisCtor: RedisCtor = (mod as unknown as RedisCtor & { default?: RedisCtor }).default ?? (mod as unknown as RedisCtor)
        redis = new RedisCtor(url)
      })
      .catch(() => {
        // If import fails, leave redis as null; callers already handle null.
      })
      .finally(() => {
        initializing = null
      })
  }
  return null
}
