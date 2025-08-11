'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bot, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'

interface OllamaModel {
  name: string
  size: number
  modified_at: string
  digest: string
  details?: unknown
}

interface ModelSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelectModel: (model: string) => void
  currentModel: string
  token: string
}

export function ModelSelector({ isOpen, onClose, onSelectModel, currentModel, token }: ModelSelectorProps) {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [ollamaAvailable, setOllamaAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/ollama/models', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json()
      
      if (response.ok) {
        setModels(data.models || [])
        setOllamaAvailable(data.available)
      } else {
        setError(data.error || 'Failed to fetch models')
        setOllamaAvailable(false)
        setModels([])
      }
    } catch (err) {
      setError('Failed to connect to server')
      setOllamaAvailable(false)
      setModels([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchModels()
    }
  }, [isOpen, token])

  const formatSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div>
                <CardTitle>Select Ollama Model</CardTitle>
                <CardDescription>
                  Choose an AI model for chat responses
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchModels}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                ✕
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            {ollamaAvailable ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-green-700 dark:text-green-400">
                  Ollama is running ({models.length} models available)
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <span className="text-orange-700 dark:text-orange-400">
                  Ollama is not available
                </span>
              </>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
              {error.includes('not running') && (
                <div className="mt-2 text-xs text-red-500 dark:text-red-400">
                  <p>To start Ollama:</p>
                  <code className="bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded">ollama serve</code>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading models...</span>
              </div>
            </div>
          ) : models.length > 0 ? (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {models.map((model) => (
                  <div
                    key={model.name}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      currentModel === model.name
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => {
                      onSelectModel(model.name)
                      onClose()
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{model.name}</h3>
                          {currentModel === model.name && (
                            <Badge variant="secondary" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                          <span>Size: {formatSize(model.size)}</span>
                          <span>Modified: {formatDate(model.modified_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : !error && ollamaAvailable ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No models found</p>
              <p className="text-sm mt-1">Pull a model first: <code>ollama pull llama2</code></p>
            </div>
          ) : null}

          {!ollamaAvailable && !isLoading && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Ollama is not running</p>
              <p className="text-sm mt-1">Start Ollama to use AI chat features</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
