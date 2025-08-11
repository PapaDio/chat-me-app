'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ModelSelector } from './ModelSelector'
import { Send, Settings } from 'lucide-react'

interface ChatInputProps {
  onSendMessage: (content: string) => void
  onSendToLLM: (content: string, model?: string) => void
  disabled?: boolean
  token: string
  isLLMChat?: boolean
  // When provided, overrides the model used for LLM sends and display
  selectedModelOverride?: string
  // Hide internal model controls (used when header owns the selector)
  showModelControls?: boolean
  // Current room for typing notifications
  roomId?: string
  // Optional typing callback from parent
  onTyping?: (isTyping: boolean) => void
}

export function ChatInput({ onSendMessage, onSendToLLM, disabled, token, isLLMChat = false, selectedModelOverride, showModelControls = true, roomId, onTyping }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState('llama3.1:8b')
  const [modelManuallySelected, setModelManuallySelected] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [isLLMLoading, setIsLLMLoading] = useState(false)
  const effectiveModel = selectedModelOverride ?? selectedModel

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      if (isLLMChat) {
        handleSendToLLM()
      } else {
        onSendMessage(message.trim())
        setMessage('')
        // Stop typing after sending
        if (roomId && onTyping && !isLLMChat) onTyping(false)
      }
    }
  }

  const handleSendToLLM = async () => {
    if (message.trim() && !disabled && !isLLMLoading) {
      setIsLLMLoading(true)
      try {
        // Only send model if the user explicitly changed it; otherwise let the backend choose
        const modelToSend = selectedModelOverride ? selectedModelOverride : (modelManuallySelected ? selectedModel : undefined)
        await onSendToLLM(message.trim(), modelToSend)
        setMessage('')
      } finally {
        setIsLLMLoading(false)
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setMessage(val)
    if (!isLLMChat && roomId && onTyping) {
      const typing = val.trim().length > 0
      onTyping(typing)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t bg-white dark:bg-gray-800 dark:border-gray-700">
        <div className="flex-1">
          <Textarea
            value={message}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            onBlur={() => { if (!isLLMChat && roomId && onTyping) onTyping(false) }}
            placeholder="Type your message..."
            className="min-h-[40px] max-h-[120px] resize-none"
            disabled={disabled || isLLMLoading}
          />
        </div>
        <div className="flex items-center gap-2">
          {isLLMChat ? (
            <>
              {/* LLM Chat Mode */}
              {showModelControls && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowModelSelector(true)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Select AI Model"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Badge variant="outline" className="text-xs">
                    🤖 {effectiveModel}
                  </Badge>
                </>
              )}
              
              <Button
                type="submit"
                size="sm"
                disabled={disabled || !message.trim() || isLLMLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLLMLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Regular Chat Mode */}
              <Button
                type="submit"
                size="sm"
                disabled={disabled || !message.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Send className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </form>

      {/* Model Info Badge */}
      {/* {selectedModel && (
        <div className="px-4 pb-2 bg-white dark:bg-gray-800">
          <Badge variant="secondary" className="text-xs">
            AI Model: {selectedModel}
          </Badge>
        </div>
      )} */}

      {/* Model Selector Dialog */}
      {showModelControls && (
        <ModelSelector
          isOpen={showModelSelector}
          onClose={() => setShowModelSelector(false)}
          onSelectModel={(m) => { setSelectedModel(m); setModelManuallySelected(true) }}
          currentModel={effectiveModel}
          token={token}
        />
      )}
    </>
  )
}
