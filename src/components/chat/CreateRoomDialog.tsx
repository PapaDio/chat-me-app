'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X } from 'lucide-react'

interface CreateRoomDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreateRoom: (roomData: {
    name: string
    description: string
    isPrivate: boolean
  }) => Promise<void>
  isLoading?: boolean
}

export function CreateRoomDialog({ isOpen, onClose, onCreateRoom, isLoading }: CreateRoomDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      await onCreateRoom({
        name: name.trim(),
        description: description.trim(),
        isPrivate,
      })
      
      // Reset form
      setName('')
      setDescription('')
      setIsPrivate(false)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Create New Room</CardTitle>
              <CardDescription>
                Create a new chat room for discussions
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="p-1"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="roomName">Room Name</Label>
              <Input
                id="roomName"
                type="text"
                placeholder="Enter room name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={50}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="roomDescription">Description (Optional)</Label>
              <Textarea
                id="roomDescription"
                placeholder="Describe what this room is for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                className="min-h-[80px]"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isPrivate"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isPrivate" className="text-sm">
                Private room (invite only)
              </Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={!name.trim() || isLoading}
              >
                {isLoading ? 'Creating...' : 'Create Room'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
