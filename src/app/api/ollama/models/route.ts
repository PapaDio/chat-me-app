import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

// Types for Ollama /api/tags response
type OllamaModelDetails = {
  format?: string
  family?: string
  parameter_size?: string
  quantization_level?: string
}

type OllamaModel = {
  name: string
  size?: number
  modified_at?: string
  digest?: string
  details?: OllamaModelDetails
}

type OllamaTagsResponse = {
  models?: OllamaModel[]
}

export async function GET(request: NextRequest) {
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

    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    
    try {
      // Get available models from Ollama
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        return NextResponse.json(
          { 
            error: 'Ollama is not running or not accessible',
            available: false,
            models: []
          },
          { status: 503 }
        )
      }

      const data: OllamaTagsResponse = await response.json()
      
      // Format models for easier use
      const models: OllamaModel[] = data.models?.map((model) => ({
        name: model.name,
        size: model.size,
        modified_at: model.modified_at,
        digest: model.digest,
        details: model.details
      })) || []

      return NextResponse.json({
        available: true,
        models: models,
        count: models.length
      })

    } catch (ollamaError) {
      console.error('Ollama connection error:', ollamaError)
      return NextResponse.json(
        { 
          error: 'Cannot connect to Ollama',
          available: false,
          models: [],
          details: 'Please ensure Ollama is installed and running: ollama serve'
        },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error('Ollama models error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
