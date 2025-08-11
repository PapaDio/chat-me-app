  'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from "sonner"
import { useAuth } from './AuthContext'

interface Message {
  id: string
  content: string
  type: 'TEXT' | 'SYSTEM' | 'LLM_RESPONSE'
  createdAt: string
  sender: {
    id: string
    username: string
    avatar?: string
  }
}

interface User {
  id: string
  username: string
  avatar?: string
  isOnline: boolean
}

// Minimal shape returned from the DM creation endpoint and used by callers
interface DirectMessageRoom {
  id: string
  createdAt: string
}

interface RealTimeContextType {
  isConnected: boolean
  onlineUsers: User[]
  messages: Message[]
  unreadCounts: Record<string, number>
  sendMessage: (content: string, roomId: string, type?: 'TEXT' | 'SYSTEM' | 'LLM_RESPONSE') => Promise<void>
  loadMessages: (roomId: string) => Promise<void>
  refreshOnlineUsers: () => Promise<void>
  setUserOnline: (isOnline: boolean) => Promise<void>
  createDirectMessage: (userId: string) => Promise<DirectMessageRoom | null>
  refreshUnreadCounts: () => Promise<void>
  markMessagesAsRead: (userId: string) => Promise<void>
  ollamaAvailable: boolean
  refreshOllamaStatus: () => Promise<void>
  setActiveDm: (userId: string | null) => void
  typingUsers: string[]
  notifyTyping: (roomId: string, isTyping: boolean, username: string) => Promise<void>
}

const RealTimeContext = createContext<RealTimeContextType | undefined>(undefined)

export function RealTimeProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [prevUnreadCounts, setPrevUnreadCounts] = useState<Record<string, number>>({})
  const prevUnreadCountsRef = useRef<Record<string, number>>({})
  const onlineUsersRef = useRef<User[]>([])
  const currentDmUserIdRef = useRef<string | null>(null)
  const [currentDmUserId, setCurrentDmUserId] = useState<string | null>(null)
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [lastMessageId, setLastMessageId] = useState<string | null>(null)
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean>(false)
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const typingDebounceRef = useRef<number | null>(null)

  const setActiveDm = useCallback((userId: string | null) => {
    setCurrentDmUserId(userId)
    currentDmUserIdRef.current = userId
  }, [])

  // Mark messages as read for a room up to a specific message id
  const markRoomRead = useCallback(async (roomId: string, upToMessageId?: string) => {
    if (!token) return
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ roomId, upToMessageId }),
      })
    } catch (e) {
      console.error('Failed to mark messages as read:', e)
    }
  }, [token])

  const notifyTyping = useCallback(async (roomId: string, isTyping: boolean, username: string) => {
    if (!token || !roomId) return
    try {
      // Debounce rapid calls from keypresses
      if (typingDebounceRef.current) {
        window.clearTimeout(typingDebounceRef.current)
        typingDebounceRef.current = null
      }
      await fetch('/api/typing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ roomId, isTyping, username }),
      })
      if (isTyping) {
        typingDebounceRef.current = window.setTimeout(() => {
          // Auto-send stop typing after TTL window
          fetch('/api/typing', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ roomId, isTyping: false, username }),
          })
        }, 2000)
      }
    } catch {}
  }, [token])

  // Poll typing users for current room; UI will decide whether to show based on tab focus
  useEffect(() => {
    if (!currentRoomId || !token) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/typing?roomId=${encodeURIComponent(currentRoomId)}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setTypingUsers(Array.isArray(data.users) ? data.users : [])
        }
      } catch {}
    }
    poll()
    const id = setInterval(poll, 1500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [currentRoomId, token])

  // Clear typing users immediately when switching rooms to hide indicator
  useEffect(() => {
    setTypingUsers([])
  }, [currentRoomId])

  // Simple notification sound using Web Audio API
  const playNotify = useCallback(() => {
    if (!audioUnlocked) return
    try {
      const W = window as unknown as { webkitAudioContext?: typeof AudioContext }
      const Ctor = window.AudioContext || W.webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(880, ctx.currentTime)
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
      o.connect(g)
      g.connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.26)
    } catch {
      // noop if AudioContext not available
    }
  }, [audioUnlocked])

  // Sonner will be used for notifications

  // Unlock WebAudio after first user interaction (required by browsers)
  useEffect(() => {
    if (audioUnlocked) return
    const onFirstInteract = async () => {
      try {
        const W = window as unknown as { webkitAudioContext?: typeof AudioContext }
        const Ctor = window.AudioContext || W.webkitAudioContext
        if (!Ctor) return
        const ctx = new Ctor()
        await ctx.resume()
        const g = ctx.createGain()
        g.gain.value = 0
        g.connect(ctx.destination)
        const o = ctx.createOscillator()
        o.connect(g)
        o.start()
        o.stop()
        setAudioUnlocked(true)
        ctx.close()
      } catch {}
      window.removeEventListener('pointerdown', onFirstInteract)
      window.removeEventListener('keydown', onFirstInteract)
    }
    window.addEventListener('pointerdown', onFirstInteract, { once: true })
    window.addEventListener('keydown', onFirstInteract, { once: true })
    return () => {
      window.removeEventListener('pointerdown', onFirstInteract)
      window.removeEventListener('keydown', onFirstInteract)
    }
  }, [audioUnlocked])

  const setUserOnline = useCallback(async (isOnline: boolean) => {
    if (!token) return

    try {
      await fetch('/api/users/online', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ isOnline }),
      })
    } catch (error) {
      console.error('Error updating user status:', error)
    }
  }, [token])

  const refreshOllamaStatus = useCallback(async () => {
    if (!token) return
    try {
      const response = await fetch('/api/ollama/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        setOllamaAvailable(false)
        return
      }
      const data = await response.json()
      setOllamaAvailable(Boolean(data.available))
    } catch {
      setOllamaAvailable(false)
    }
  }, [token])

  // Set user online when component mounts
  useEffect(() => {
    if (user && token) {
      setUserOnline(true)
      setIsConnected(true)
    }
    return () => {
      if (user && token) {
        setUserOnline(false)
      }
    }
  }, [user, token, setUserOnline])


  // (moved) Poll for new messages effect is defined after pollForNewMessages callback

  

  // Heartbeat: keep user marked online periodically to avoid stale states
  useEffect(() => {
    if (!isConnected || !user || !token) return

    const hb = setInterval(() => {
      setUserOnline(true)
    }, 20000) // every 20 seconds

    return () => clearInterval(hb)
  }, [isConnected, user, token, setUserOnline])

  // Check Ollama availability periodically
  useEffect(() => {
    if (!isConnected || !token) return

    // initial check
    refreshOllamaStatus()

    const interval = setInterval(() => {
      refreshOllamaStatus()
    }, 10000) // every 10 seconds

    return () => clearInterval(interval)
  }, [isConnected, token, refreshOllamaStatus])

  const refreshOnlineUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users/online')
      if (response.ok) {
        const data = await response.json()
        setOnlineUsers(data.users)
      }
    } catch (error) {
      console.error('Error fetching online users:', error)
    }
  }, [])

  // Refresh online users periodically (placed after refreshOnlineUsers is defined)
  useEffect(() => {
    if (!isConnected) return

    const interval = setInterval(() => {
      refreshOnlineUsers()
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [isConnected, refreshOnlineUsers])

  // Place unread counts refresher before any usage
  const refreshUnreadCounts = useCallback(async () => {
    if (!token) return

    try {
      const response = await fetch('/api/unread-messages', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        const nextCounts: Record<string, number> = data.unreadCounts || {}

        // Detect increases and notify (suppress if currently in that DM)
        const prevCounts = prevUnreadCountsRef.current
        const dmActive = currentDmUserIdRef.current
        const usersList = onlineUsersRef.current
        for (const [userId, count] of Object.entries(nextCounts)) {
          const prev = prevCounts[userId] || 0
          if (count > prev) {
            const u = usersList.find(u => u.id === userId)
            const name = u?.username || 'New message'
            if (dmActive !== userId) {
              playNotify()
              toast(`${name}: New message`)
            }
          }
        }

        setPrevUnreadCounts(nextCounts)
        prevUnreadCountsRef.current = nextCounts
        setUnreadCounts(nextCounts)
      }
    } catch (error) {
      console.error('Error fetching unread counts:', error)
    }
  }, [token, playNotify])

  const loadMessages = useCallback(async (roomId: string) => {
    try {
      const response = await fetch(`/api/messages?roomId=${roomId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages)
        setCurrentRoomId(roomId)
        
        // Set last message ID for polling
        if (data.messages.length > 0) {
          setLastMessageId(data.messages[data.messages.length - 1].id)
          // Mark up to last message as read (messages from others)
          await markRoomRead(roomId, data.messages[data.messages.length - 1].id)
          // Refresh unread counters after reading
          await refreshUnreadCounts()
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }, [markRoomRead, refreshUnreadCounts])

  const pollForNewMessages = useCallback(async () => {
    if (!currentRoomId) return

    try {
      const url = lastMessageId 
        ? `/api/messages?roomId=${currentRoomId}&lastMessageId=${lastMessageId}`
        : `/api/messages?roomId=${currentRoomId}`
      
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        if (data.messages.length > 0) {
          setMessages(prev => {
            // Deduplicate messages by ID
            const existingIds = new Set(prev.map(msg => msg.id))
            const newMessages = data.messages.filter((msg: Message) => !existingIds.has(msg.id))

            // We are in the current room; do NOT play sound or Sonner here.
            // Intentionally no toast/sound while actively viewing this room

            return [...prev, ...newMessages]
          })
          setLastMessageId(data.messages[data.messages.length - 1].id)

          // Mark new messages as read up to the newest
          await markRoomRead(currentRoomId, data.messages[data.messages.length - 1].id)
          // Refresh unread counters after reading
          await refreshUnreadCounts()
        }
      }
    } catch (error) {
      console.error('Error polling for messages:', error)
    }
  }, [currentRoomId, lastMessageId, markRoomRead, refreshUnreadCounts])

  // Poll for new messages in current room (placed after callback definition)
  useEffect(() => {
    if (!currentRoomId || !isConnected) return

    const interval = setInterval(() => {
      pollForNewMessages()
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [currentRoomId, isConnected, lastMessageId, pollForNewMessages])

  const sendMessage = useCallback(async (content: string, roomId: string, type: 'TEXT' | 'SYSTEM' | 'LLM_RESPONSE' = 'TEXT') => {
    if (!token) return

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content, roomId, type }),
      })

      if (response.ok) {
        const data = await response.json()
        // Add the message immediately for better UX
        setMessages(prev => [...prev, data.message])
        setLastMessageId(data.message.id)
      }
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }, [token])

  const createDirectMessage = useCallback(async (userId: string) => {
    if (!token) return null

    try {
      const response = await fetch(`/api/direct-messages?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to create direct message')
      }

      const data = await response.json()
      return data.room
    } catch (error) {
      console.error('Error creating direct message:', error)
      return null
    }
  }, [token])

  

  const markMessagesAsRead = useCallback(async (userId: string) => {
    if (!token) return

    try {
      // Track active DM context to suppress sound for this peer
      setCurrentDmUserId(userId)
      currentDmUserIdRef.current = userId
      const response = await fetch('/api/unread-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        // Clear unread count for this user
        setUnreadCounts(prev => ({
          ...prev,
          [userId]: 0,
        }))
        setPrevUnreadCounts(prev => ({
          ...prev,
          [userId]: 0,
        }))
      }
    } catch (error) {
      console.error('Error marking messages as read:', error)
    }
  }, [token])

  // Poll unread counters regardless of current room to support cross-room notifications
  useEffect(() => {
    if (!isConnected || !token) return

    // Initial fetch
    refreshUnreadCounts()

    const interval = setInterval(() => {
      refreshUnreadCounts()
    }, 5000)

    return () => clearInterval(interval)
  }, [isConnected, token, refreshUnreadCounts])

  // Keep refs in sync with state without making refreshUnreadCounts unstable
  useEffect(() => {
    prevUnreadCountsRef.current = prevUnreadCounts
  }, [prevUnreadCounts])

  useEffect(() => {
    onlineUsersRef.current = onlineUsers
  }, [onlineUsers])

  useEffect(() => {
    currentDmUserIdRef.current = currentDmUserId
  }, [currentDmUserId])

  const value: RealTimeContextType = {
    isConnected,
    onlineUsers,
    messages,
    unreadCounts,
    sendMessage,
    loadMessages,
    refreshOnlineUsers,
    setUserOnline,
    createDirectMessage,
    refreshUnreadCounts,
    markMessagesAsRead,
    ollamaAvailable,
    refreshOllamaStatus,
    setActiveDm,
    typingUsers,
    notifyTyping,
  }

  return (
    <RealTimeContext.Provider value={value}>
      {children}
    </RealTimeContext.Provider>
  )
}

export function useRealTime() {
  const context = useContext(RealTimeContext)
  if (context === undefined) {
    throw new Error('useRealTime must be used within a RealTimeProvider')
  }
  return context
}
