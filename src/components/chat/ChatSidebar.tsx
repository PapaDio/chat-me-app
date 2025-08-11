'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRealTime } from '@/contexts/RealTimeContext'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { CreateRoomDialog } from './CreateRoomDialog'
import { cn } from '@/lib/utils'
import { Users, MessageCircle, Plus, Lock } from 'lucide-react'

interface Room {
  id: string
  name: string
  description?: string
  memberCount: number
  isPrivate: boolean
  isMember: boolean
  lastMessage?: string
  lastMessageTime?: Date
  createdAt: string
  creator?: {
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
  unreadCount?: number
}

interface ChatSidebarProps {
  rooms: Room[]
  currentRoom: Room | null
  onRoomSelect: (room: Room) => void
  onDirectMessage: (user: User) => void
  className?: string
}

export default function ChatSidebar({
  rooms,
  currentRoom,
  onRoomSelect,
  onDirectMessage,
  className
}: ChatSidebarProps) {
  const { user, token } = useAuth()
  const { onlineUsers, unreadCounts, ollamaAvailable } = useRealTime()
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false)

  const handleCreateRoom = async (roomData: {
    name: string
    description: string
    isPrivate: boolean
  }) => {
    if (!token) return
    try {
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(roomData),
      })

      if (response.ok) {
        const data = await response.json()
        onRoomSelect(data.room)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create room')
      }
    } catch (error) {
      console.error('Failed to create room:', error)
      alert('Failed to create room')
    }
  }
  return (
    <div className={cn("w-64 bg-gray-50 dark:bg-gray-900 border-r dark:border-gray-700 flex flex-col h-full", className)}>
      {/* Header */}
      <div className="p-4 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Chat Me App</h2>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
        
      </div>

      {/* Rooms Section */}
      <div className="flex-1 overflow-hidden">
        <div className="p-3 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              My Rooms
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCreateRoomOpen(true)}
              className="p-1"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          
          <ScrollArea className="h-32">
            {/* Room List */}
            {rooms?.map((room) => (
              <button
                key={room.id}
                onClick={() => onRoomSelect(room)}
                className={cn(
                  "w-full text-left p-2 rounded text-sm transition-colors",
                  currentRoom?.id === room.id
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{room.name}</span>
                    {room.isPrivate && <Lock className="w-3 h-3" />}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {room.memberCount}
                  </Badge>
                </div>
                {room.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {room.description}
                  </p>
                )}
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* Available Rooms Section */}


        {/* Online Users Section */}
        <div className="p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
            <Users className="w-4 h-4" />
            Online Users ({onlineUsers?.length - 1 || 0})
          </h3>
          
          <ScrollArea className="h-32">
            <div className="space-y-1">
              {/* LLM Chat Option */}
              <button
                onClick={() => {
                  if (!ollamaAvailable) return
                  onDirectMessage({ id: 'llm', username: 'AI Assistant', avatar: '', isOnline: true })
                }}
                className={cn(
                  "w-full flex items-center gap-2 p-1 rounded text-sm transition-colors cursor-pointer",
                  ollamaAvailable
                    ? "hover:bg-purple-100 dark:hover:bg-purple-900/30 bg-purple-50 dark:bg-purple-900/20"
                    : "opacity-70 cursor-not-allowed bg-gray-100 dark:bg-gray-800"
                )}
                title={ollamaAvailable ? "Chat with AI Assistant" : "Ollama is not running"}
                disabled={!ollamaAvailable}
              >
                <div className="relative">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    ollamaAvailable ? "bg-purple-500" : "bg-gray-500"
                  )}>
                    <span className="text-white text-xs">🤖</span>
                  </div>
                  <div
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white dark:border-gray-800 rounded-full",
                      ollamaAvailable ? "bg-green-500" : "bg-gray-400"
                    )}
                  />
                </div>
                <div className="flex items-center justify-between flex-1">
                  <span className={cn(
                    "font-medium",
                    ollamaAvailable ? "text-purple-700 dark:text-purple-300" : "text-gray-600 dark:text-gray-300"
                  )}>AI Assistant { !ollamaAvailable && <span className="text-xs ml-1">(offline)</span> }</span>
                </div>
              </button>

              {/* Online Users */}
              {onlineUsers
                ?.filter(onlineUser => onlineUser.id !== user?.id)
                .map((onlineUser) => (
                  <button
                    key={onlineUser.id}
                    onClick={() => onDirectMessage(onlineUser)}
                    className="w-full flex items-center gap-2 p-1 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    title={`Start direct message with ${onlineUser.username}`}
                  >
                    <div className="relative">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={onlineUser.avatar} />
                        <AvatarFallback className="text-xs">
                          {onlineUser.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
                    </div>
                    <div className="flex items-center justify-between flex-1">
                      <span className="text-gray-700 dark:text-gray-300">{onlineUser.username}</span>
                      {unreadCounts?.[onlineUser.id] && unreadCounts[onlineUser.id] > 0 ? (
                        <Badge variant="destructive" className="text-xs h-5 min-w-5 px-1">
                          {unreadCounts[onlineUser.id] > 99 ? '99+' : unreadCounts[onlineUser.id]}
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                )) || []}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Create Room Dialog */}
      <CreateRoomDialog
        isOpen={isCreateRoomOpen}
        onClose={() => setIsCreateRoomOpen(false)}
        onCreateRoom={handleCreateRoom}
        isLoading={false}
      />
    </div>
  )
}
