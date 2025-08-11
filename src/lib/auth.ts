import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Use a consistent JWT secret - if not set in env, use a fixed fallback for development
const JWT_SECRET = process.env.JWT_SECRET || 'windsurf-chat-app-development-secret-key-2024'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

export function generateToken(userId: string): string {
  console.log('Generating token with JWT_SECRET:', JWT_SECRET ? 'SET' : 'NOT SET')
  console.log('JWT_SECRET length:', JWT_SECRET?.length || 0)
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
  console.log('Generated token for userId:', userId)
  return token
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    if (!JWT_SECRET || JWT_SECRET === 'your-secret-key') {
      console.error('JWT_SECRET is not properly configured')
      return null
    }
    
    if (!token || token.trim() === '') {
      console.error('Empty or invalid token provided')
      return null
    }
    
    console.log('Verifying token with JWT_SECRET: SET')
    console.log('JWT_SECRET length during verification:', JWT_SECRET?.length || 0)
    console.log('Token length:', token.length)
    console.log('Token starts with:', token.substring(0, 20) + '...')
    
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    console.log('Token verified successfully for userId:', decoded.userId)
    return decoded
  } catch (error) {
    console.error('Token verification failed:', error instanceof Error ? error.message : error)
    console.error('Failed token:', token.substring(0, 50) + '...')
    return null
  }
}
