'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  message: {
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
  currentUserId: string
}

export function ChatMessage({ message, currentUserId }: ChatMessageProps) {
  const isOwnMessage = message.sender.id === currentUserId
  const isSystemMessage = message.type === 'SYSTEM'
  const isLLMMessage = message.type === 'LLM_RESPONSE'

  if (isSystemMessage) {
    return (
      <div className="flex justify-center my-2">
        <Badge variant="secondary" className="text-xs">
          {message.content}
        </Badge>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex gap-3 mb-4 message-enter',
        isOwnMessage ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <Avatar className="w-8 h-8">
        <AvatarImage src={message.sender.avatar} />
        <AvatarFallback>
          {message.sender.username.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div
        className={cn(
          'max-w-[70%] rounded-lg px-3 py-2 message-enter',
          isOwnMessage
            ? 'bg-blue-500 text-white'
            : isLLMMessage
            ? 'bg-purple-100 text-purple-900 border border-purple-200'
            : 'bg-gray-100 text-gray-900'
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">
            {isLLMMessage ? '🤖 AI Assistant' : message.sender.username}
          </span>
          <span className="text-xs opacity-70">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}
