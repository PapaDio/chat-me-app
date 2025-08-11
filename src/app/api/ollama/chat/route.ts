import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptText, isEncrypted } from '@/lib/crypto'

export async function POST(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      )
    }

    const { message, model: requestedModel, userId } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check if Ollama is available
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    
    try {
      // First, check if Ollama is running
      const healthCheck = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!healthCheck.ok) {
        return NextResponse.json(
          { error: 'Ollama is not running. Please start Ollama and ensure it\'s accessible at ' + ollamaUrl },
          { status: 503 }
        )
      }

      // Determine model to use: prefer running model; else requested if available; else fallback to llama3.1:8b; else any available model
      let modelToUse: string | null = null
      let tags: { models?: { name: string }[] } = {}

      // Try currently running models first
      try {
        const psRes = await fetch(`${ollamaUrl}/api/ps`, { method: 'GET' })
        if (psRes.ok) {
          const psData = await psRes.json() as { models?: { name: string; model: string }[] }
          const running = (psData.models || []).map(m => m.name || m.model).filter(Boolean)
          if (running.length > 0) {
            modelToUse = running[0]
          }
        }
      } catch { /* ignore */ }

      // Parse tags once for availability checks
      if (!modelToUse) {
        try {
          tags = await healthCheck.json()
        } catch { tags = {} }
      }

      // If no running model, use requested if provided AND present in tags
      if (!modelToUse && typeof requestedModel === 'string' && requestedModel.length > 0) {
        const hasRequested = !!(tags.models || []).find(m => m.name === requestedModel)
        if (hasRequested) {
          modelToUse = requestedModel
        }
      }

      // If still none, try fallback to llama3.1:8b (preferred default) if present in tags
      if (!modelToUse) {
        const hasFallback = !!(tags.models || []).find(m => m.name === 'llama3.1:8b')
        if (hasFallback) {
          modelToUse = 'llama3.1:8b'
        }
      }

      // Final fallback: pick the first available tag if any
      if (!modelToUse && (tags.models || []).length > 0) {
        modelToUse = tags.models![0].name
      }

      if (!modelToUse) {
        return NextResponse.json(
          { error: 'No running Ollama model detected and fallback model "llama3.1:8b" is not available. Start a model (e.g., `ollama run llama3.1:8b`) or pull it first.' },
          { status: 503 }
        )
      }

      // Send message to Ollama
      let response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelToUse,
          prompt: message,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 500,
          }
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Ollama API error:', errorText)
        // If model not found, retry once with fallback llama3.1:8b if available and not already used
        if (response.status === 404 && modelToUse !== 'llama3.1:8b') {
          const hasFallback = !!(tags.models || []).find(m => m.name === 'llama3.1:8b')
          if (hasFallback) {
            response = await fetch(`${ollamaUrl}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'llama3.1:8b',
                prompt: message,
                stream: false,
                options: { temperature: 0.7, top_p: 0.9, max_tokens: 500 }
              }),
            })
            if (!response.ok) {
              const retryText = await response.text()
              console.error('Ollama API retry error:', retryText)
              return NextResponse.json(
                { error: 'Failed to get response from Ollama (retry with fallback failed)' },
                { status: 500 }
              )
            }
          } else {
            return NextResponse.json(
              { error: 'Model not found. Please pull the model first or start a running model.' },
              { status: 404 }
            )
          }
        } else if (!response.ok) {
          return NextResponse.json(
            { error: 'Failed to get response from Ollama' },
            { status: 500 }
          )
        }
      }

      const data = await response.json()
      const llmResponse = data.response || 'No response from model'
      
      // Ensure we have an AI Assistant user to attribute LLM messages to
      const aiUsername = 'AI Assistant'
      const aiEmail = 'ai-assistant@local'
      let aiUser = await prisma.user.findFirst({
        where: {
          username: aiUsername,
        },
      })
      if (!aiUser) {
        // Create a placeholder user; password is not used for login
        aiUser = await prisma.user.create({
          data: {
            username: aiUsername,
            email: aiEmail,
            password: 'disabled-ai-account',
            avatar: '',
            isOnline: false,
          },
        })
      }
      
      // Create or get LLM chat room for this user
      let llmRoom = await prisma.room.findFirst({
        where: {
          name: `LLM Chat - ${userId}`,
          isPrivate: true,
          isDirect: false,
        }
      })

      if (!llmRoom) {
        llmRoom = await prisma.room.create({
          data: {
            name: `LLM Chat - ${userId}`,
            description: 'Chat with AI Assistant',
            isPrivate: true,
            isDirect: false,
            creatorId: userId,
            members: {
              create: [
                { userId: userId }
              ]
            }
          }
        })
      }

      // Save user message (encrypt at rest)
      await prisma.message.create({
        data: {
          content: isEncrypted(message) ? message : encryptText(message),
          type: 'TEXT',
          senderId: userId,
          roomId: llmRoom.id,
        }
      })

      // Save LLM response (as AI Assistant user, encrypt at rest)
      await prisma.message.create({
        data: {
          content: isEncrypted(llmResponse) ? llmResponse : encryptText(llmResponse),
          type: 'LLM_RESPONSE',
          senderId: aiUser.id,
          roomId: llmRoom.id,
        }
      })
      
      return NextResponse.json({
        response: llmResponse,
        model: modelToUse,
        done: data.done || true,
        roomId: llmRoom.id,
      })

    } catch (ollamaError) {
      console.error('Ollama connection error:', ollamaError)
      return NextResponse.json(
        { 
          error: 'Cannot connect to Ollama. Please ensure Ollama is installed and running.',
          details: 'Start Ollama with: ollama serve'
        },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error('Ollama chat error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
