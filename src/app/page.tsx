'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, Users, Bot } from 'lucide-react'

export default function Home() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.push('/chat')
    }
  }, [user, router])

  const handleGetStarted = () => {
    router.push('/auth')
  }

  if (user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div>Redirecting to chat...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            NextJS Chat App
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Connect with friends over your local network and chat with AI assistants powered by Ollama
          </p>
          <Button onClick={handleGetStarted} size="lg" className="px-8 py-3 text-lg">
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <MessageCircle className="w-12 h-12 text-blue-500 mb-4" />
              <CardTitle>Real-time Chat</CardTitle>
              <CardDescription>
                Chat with other users on your local network in real-time
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Users className="w-12 h-12 text-green-500 mb-4" />
              <CardTitle>Local Network</CardTitle>
              <CardDescription>
                Connect with users on the same network without internet dependency
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Bot className="w-12 h-12 text-purple-500 mb-4" />
              <CardTitle>AI Integration</CardTitle>
              <CardDescription>
                Chat with locally installed LLMs using Ollama for privacy-focused AI conversations
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  )
}
