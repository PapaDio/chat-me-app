'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { SignupForm } from '@/components/auth/SignupForm'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const { login, signup, isLoading, error } = useAuth()
  const router = useRouter()

  const handleLogin = async (email: string, password: string) => {
    try {
      await login(email, password)
      router.push('/chat')
    } catch {
      // Error is handled by the context
    }
  }

  const handleSignup = async (username: string, email: string, password: string) => {
    try {
      await signup(username, email, password)
      router.push('/chat')
    } catch {
      // Error is handled by the context
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {isLogin ? (
          <LoginForm
            onLogin={handleLogin}
            onSwitchToSignup={() => setIsLogin(false)}
            isLoading={isLoading}
            error={error || undefined}
          />
        ) : (
          <SignupForm
            onSignup={handleSignup}
            onSwitchToLogin={() => setIsLogin(true)}
            isLoading={isLoading}
            error={error || undefined}
          />
        )}
      </div>
    </div>
  )
}
