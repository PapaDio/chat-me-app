'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useRealTime } from '@/contexts/RealTimeContext'
import ChatSidebar from '@/components/chat/ChatSidebar'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { ChatInput } from '@/components/chat/ChatInput'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { Settings } from 'lucide-react'

interface Room {
  id: string
  name: string
  description?: string
  memberCount: number
  isPrivate: boolean
  isMember: boolean
  isDirect?: boolean
  lastMessage?: string
  lastMessageTime?: Date
  createdAt: string
  creator?: {
    id: string
    username: string
    avatar?: string
  }
  members?: { id: string; username: string }[]
}

interface User {
  id: string
  username: string
  avatar?: string
  isOnline: boolean
  unreadCount?: number
}

export default function ChatPage() {
  const { user, logout, token } = useAuth()
  const { 
    isConnected, 
    onlineUsers, 
    messages, 
    sendMessage, 
    loadMessages, 
    refreshOnlineUsers,
    createDirectMessage,
    markMessagesAsRead,
    ollamaAvailable,
    setActiveDm,
    typingUsers,
    notifyTyping,
  } = useRealTime()
  const params = useParams<{ userId?: string; roomId?: string }>()
  const lastRouteKeyRef = useRef<string | null>(null)
  const router = useRouter()
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLLMChat, setIsLLMChat] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAiTyping, setIsAiTyping] = useState(false)
  const [isWindowFocused, setIsWindowFocused] = useState(true)
  // Temporarily disable auto-animate to avoid ref-induced update loops
  const messagesParent = useCallback(() => { /* no-op */ }, [])
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const lastMessagesElRef = useRef<HTMLDivElement | null>(null)
  const [selectedModelHeader, setSelectedModelHeader] = useState<string>('llama3.1:8b')
  const [showModelSelectorHeader, setShowModelSelectorHeader] = useState(false)

  // Helper: scroll to bottom immediately after messages render
  const scrollToBottomNow = useCallback(() => {
    const doScroll = () => {
      const el = messagesContainerRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    }
    // Double rAF to ensure DOM has painted after state updates
    requestAnimationFrame(() => requestAnimationFrame(doScroll))
  }, [])

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && !isLoading) {
      router.push('/auth')
    }
  }, [user, isLoading, router])

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      if (!token) return

      try {
        // Load rooms
        const roomsResponse = await fetch('/api/rooms', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (roomsResponse.ok) {
          const roomsData = await roomsResponse.json()
          console.log('Rooms data received:', roomsData)
          // Combine member rooms and available rooms, but exclude direct/LLM rooms from sidebar
          const allRooms: Room[] = [...(roomsData.memberRooms || []), ...(roomsData.availableRooms || [])]
          const visibleRooms = allRooms.filter((r: Room) => !r.isDirect && !(typeof r.name === 'string' && r.name.startsWith('LLM Chat - ')))
          setRooms(visibleRooms)
          console.log('Total visible rooms set:', visibleRooms.length)
        }

        // Refresh online users
        await refreshOnlineUsers()
        
        setIsLoading(false)
      } catch (error) {
        console.error('Error loading initial data:', error)
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [token, refreshOnlineUsers])

  // Track window focus to only show typing indicator when focused on same chat
  useEffect(() => {
    const onFocus = () => setIsWindowFocused(true)
    const onBlur = () => setIsWindowFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    // Scroll to bottom smoothly on new messages
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handleSendMessage = async (content: string) => {
    if (!currentRoom || !user) return

    if (isLLMChat) {
      // Handle LLM chat
      await handleSendToLLM(content)
    } else {
      // Handle regular room chat
      await sendMessage(content, currentRoom.id, 'TEXT')
    }
  }

  const handleSendToLLM = async (content: string, model?: string) => {
    if (!user || !token) return

    try {
      setIsAiTyping(true)
      const body: Record<string, unknown> = {
        message: content,
        userId: user.id,
      }
      if (model) body.model = model

      const response = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to get AI response')
      }

      const data = await response.json()
      console.log('LLM response received:', data.response)
      
      // If we have a room ID, switch to that room to show the conversation
      if (data.roomId && isLLMChat) {
        // Simulate short thinking delay for smoother UX
        await new Promise((res) => setTimeout(res, 600))
        await loadMessages(data.roomId)
      }
      
    } catch (error) {
      console.error('LLM chat error:', error)
    } finally {
      setIsAiTyping(false)
    }
  }

  const handleDirectMessage = async (targetUser: User) => {
    console.log('Starting direct message with user:', targetUser)
    
    // Handle LLM chat specially
    if (targetUser.id === 'llm') {
      try {
        if (!token) return
        // If already in LLM chat, no-op
        if (isLLMChat && currentRoom) return
        // Navigate to DM route for LLM
        router.push(`/chat/dm/llm`)
        // Get or create the LLM room for this user
        const resp = await fetch('/api/ollama/room', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        if (!resp.ok) {
          console.error('Failed to get LLM room')
          return
        }
        const data = await resp.json()
        const llmRoom = data.room

        // Set as current room and load history
        setCurrentRoom({
          id: llmRoom.id,
          name: llmRoom.name,
          description: llmRoom.description,
          memberCount: llmRoom.memberCount ?? 1,
          isPrivate: true,
          isMember: true,
          createdAt: llmRoom.createdAt,
        })
        setIsLLMChat(true)
        await loadMessages(llmRoom.id)
        // Suppress notifications while viewing LLM chat (no unread for LLM peer)
        // No markMessagesAsRead call needed for LLM
        setActiveDm('llm')
      } catch (e) {
        console.error('LLM room selection error:', e)
      }
      // Close sidebar on mobile when entering LLM chat
      setSidebarOpen(false)
      return
    }
    
    try {
      // Create or get direct message room
      const room = await createDirectMessage(targetUser.id)
      console.log('Direct message room response:', room)
      
      if (room) {
        // If already in this DM room, no-op
        if (currentRoom?.id === room.id) {
          setActiveDm(targetUser.id)
          await markMessagesAsRead(targetUser.id)
          setSidebarOpen(false)
          return
        }
        // Navigate to DM route using username for prettier URLs
        router.push(`/chat/dm/${encodeURIComponent(targetUser.username)}`)
        setCurrentRoom({
          id: room.id,
          name: `Chat with ${targetUser.username}`,
          description: `Direct message with ${targetUser.username}`,
          memberCount: 2,
          isPrivate: true,
          isMember: true,
          createdAt: room.createdAt
        })
        setIsLLMChat(false)
        setActiveDm(targetUser.id)
        await loadMessages(room.id)
        scrollToBottomNow()
        await markMessagesAsRead(targetUser.id)
        // Close sidebar on mobile after selecting DM
        setSidebarOpen(false)
        return
      }
    } catch (error) {
      console.error('Error creating direct message:', error)
      alert('Failed to create direct message')
    }
  }

  const handleRoomSelect = async (room: Room) => {
    console.log('Selecting room:', room)
    if (currentRoom?.id === room.id && !isLLMChat) {
      // Already in this room
      return
    }
    setCurrentRoom(room)
    setIsLLMChat(false)
    // Navigate to room route using room name for pretty URL
    router.push(`/chat/room/${encodeURIComponent(room.name)}`)
    // Clear active DM suppression when in a room
    setActiveDm(null)
    await loadMessages(room.id)
    scrollToBottomNow()
    // Close sidebar on mobile after selecting room
    setSidebarOpen(false)
  }

  const handleLLMChatSelect = () => {
    setCurrentRoom(null)
    setIsLLMChat(true)
  }

  const handleLogout = () => {
    logout()
    router.push('/auth')
  }

  // Route-driven loader: respond to /chat/dm/[userId] or /chat/room/[roomId]
  useEffect(() => {
    const run = async () => {
      if (!token) return
      const key = params?.userId ? `dm:${params.userId}` : params?.roomId ? `room:${params.roomId}` : 'none'
      if (lastRouteKeyRef.current === key) return

      // DM route
      if (params?.userId) {
        // dmKey may be a username (preferred) or legacy userId
        const dmKey = params.userId as string
        if (dmKey === 'llm') {
          try {
            const resp = await fetch('/api/ollama/room', {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${token}` },
            })
            if (!resp.ok) return
            const data = await resp.json()
            const llmRoom = data.room
            if (currentRoom?.id === llmRoom.id && isLLMChat) {
              setActiveDm('llm')
              lastRouteKeyRef.current = key
              return
            }
            setCurrentRoom({
              id: llmRoom.id,
              name: llmRoom.name,
              description: llmRoom.description,
              memberCount: llmRoom.memberCount ?? 1,
              isPrivate: true,
              isMember: true,
              createdAt: llmRoom.createdAt,
            })
            setIsLLMChat(true)
            setActiveDm('llm')
            await loadMessages(llmRoom.id)
            scrollToBottomNow()
            lastRouteKeyRef.current = key
            return
          } catch {}
        } else {
          // Human DM: resolve dmKey to a userId from onlineUsers (username first, fallback to id). If not found, query server.
          let resolvedUser = onlineUsers?.find(u => u.username === dmKey) || onlineUsers?.find(u => u.id === dmKey)
          if (!resolvedUser) {
            try {
              const uResp = await fetch(`/api/users/by-username?username=${encodeURIComponent(dmKey)}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
              })
              if (uResp.ok) {
                const uData = await uResp.json()
                resolvedUser = uData.user
              } else {
                console.warn('DM user not found by username/id (server):', dmKey)
                lastRouteKeyRef.current = key
                return
              }
            } catch (e) {
              console.warn('Error resolving user by username:', e)
              lastRouteKeyRef.current = key
              return
            }
          }
          if (!resolvedUser) {
            lastRouteKeyRef.current = key
            return
          }
          const targetUserId = resolvedUser.id
          const targetUsername = resolvedUser.username
          const room = await createDirectMessage(targetUserId)
          if (room) {
            if (currentRoom?.id === room.id && !isLLMChat) {
              setActiveDm(targetUserId)
              await markMessagesAsRead(targetUserId)
              lastRouteKeyRef.current = key
              return
            }
            setCurrentRoom({
              id: room.id,
              name: `Chat with ${targetUsername}`,
              description: `Direct message with ${targetUsername}`,
              memberCount: 2,
              isPrivate: true,
              isMember: true,
              createdAt: room.createdAt,
            })
            setIsLLMChat(false)
            setActiveDm(targetUserId)
            await loadMessages(room.id)
            scrollToBottomNow()
            await markMessagesAsRead(targetUserId)
            lastRouteKeyRef.current = key
            return
          }
        }
      }

      // Room route
      if (params?.roomId) {
        const ridKey = params.roomId as string
        // If already viewing this resolved room id, no-op
        // Try to resolve ridKey as a name first (pretty URL), else treat as id
        let resolvedRoomId = ridKey
        // naive id pattern check; if it doesn't look like an id, attempt server lookup by name
        if (!/^[a-f0-9-]{10,}$/i.test(ridKey)) {
          try {
            const rResp = await fetch(`/api/rooms/by-name?name=${encodeURIComponent(ridKey)}`, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${token}` },
            })
            if (rResp.ok) {
              const rData = await rResp.json()
              resolvedRoomId = rData.room.id
            }
          } catch {}
        }
        if (currentRoom?.id === resolvedRoomId && !isLLMChat) {
          setActiveDm(null)
          lastRouteKeyRef.current = key
          return
        }
        setIsLLMChat(false)
        setActiveDm(null)
        await loadMessages(resolvedRoomId)
        scrollToBottomNow()
        lastRouteKeyRef.current = key
        return
      }
      // No params at /chat root
      lastRouteKeyRef.current = key
    }
    run()
  // include only params and token to avoid loops; callbacks are stable enough
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.userId, params?.roomId, token])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block w-72 shrink-0 border-r border-border">
        <ChatSidebar
          rooms={rooms}
          currentRoom={currentRoom}
          onRoomSelect={handleRoomSelect}
          onDirectMessage={handleDirectMessage}
        />
      </div>

      {/* Mobile overlay sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-72 max-w-[80%] h-full bg-background border-r border-border shadow-xl">
            <ChatSidebar
              rooms={rooms}
              currentRoom={currentRoom}
              onRoomSelect={handleRoomSelect}
              onDirectMessage={handleDirectMessage}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="border-b border-border p-4 flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            Menu
          </button>
          <h2 className="text-lg font-semibold truncate">
            {isLLMChat ? '🤖 AI Assistant' : currentRoom?.name || 'Select a room'}
          </h2>
          {/* Right side controls */}
          <div className="ml-auto flex items-center gap-2">
            {isLLMChat && (
              <>
                <span className="hidden sm:inline text-xs px-2 py-1 rounded border border-border bg-muted/40">🤖 {selectedModelHeader}</span>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
                  onClick={() => setShowModelSelectorHeader(true)}
                  disabled={!ollamaAvailable}
                  aria-label="Select AI Model"
                  title={ollamaAvailable ? 'Select AI Model' : 'Ollama is offline'}
                >
                  <Settings className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          ref={(el) => {
            const divEl = el as HTMLDivElement | null
            if (lastMessagesElRef.current !== divEl) {
              messagesParent()
              messagesContainerRef.current = divEl
              lastMessagesElRef.current = divEl
            }
          }}
        >
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              currentUserId={user?.id || ''}
            />
          ))}
          {/* Human typing indicator: only when focused on this chat */}
          {!isLLMChat && typingUsers.length > 0 && isWindowFocused && currentRoom && (
            <div className="flex gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">💬</div>
              <div className="max-w-[70%] rounded-lg px-3 py-2 bg-gray-100 text-gray-900 border border-gray-200 message-enter">
                <div className="text-xs font-medium mb-1">{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…</div>
                <div className="flex items-center gap-1 h-5">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}
          {isLLMChat && isAiTyping && (
            <div className="flex gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">🤖</div>
              <div className="max-w-[70%] rounded-lg px-3 py-2 bg-purple-100 text-purple-900 border border-purple-200 message-enter">
                <div className="text-xs font-medium mb-1">AI Assistant</div>
                <div className="flex items-center gap-1 h-5">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        {(isLLMChat || currentRoom || params?.roomId || params?.userId) && (
          <div className="border-t border-border p-4">
            <ChatInput
              onSendMessage={handleSendMessage}
              onSendToLLM={handleSendToLLM}
              isLLMChat={isLLMChat}
              disabled={!isConnected}
              token={token || ''}
              selectedModelOverride={isLLMChat ? selectedModelHeader : undefined}
              showModelControls={!isLLMChat}
              roomId={currentRoom?.id}
              onTyping={(isTyping) => {
                if (!currentRoom || !user) return
                notifyTyping(currentRoom.id, isTyping, user.username)
              }}
            />
          </div>
        )}
      </div>

      {/* Header Model Selector */}
      {isLLMChat && (
        <ModelSelector
          isOpen={showModelSelectorHeader}
          onClose={() => setShowModelSelectorHeader(false)}
          onSelectModel={(m) => setSelectedModelHeader(m)}
          currentModel={selectedModelHeader}
          token={token || ''}
        />
      )}
    </div>
  )
}
