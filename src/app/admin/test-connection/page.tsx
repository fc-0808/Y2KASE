'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TestConnectionPage() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  async function testConnection() {
    setLoading(true)
    setResult('Testing...')

    try {
      const supabase = createClient()
      
      // Test 1: Check if client is created
      setResult(prev => prev + '\n✅ Supabase client created')

      // Test 2: Try to fetch session
      const { error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        setResult(prev => prev + '\n❌ Session error: ' + sessionError.message)
      } else {
        setResult(prev => prev + '\n✅ Session check passed (no session)')
      }

      // Test 3: Try a simple auth call
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: 'test@test.com',
        password: 'wrongpassword'
      })
      
      if (signInError) {
        if (signInError.message.includes('Invalid')) {
          setResult(prev => prev + '\n✅ Auth endpoint reachable (got invalid credentials error)')
        } else {
          setResult(prev => prev + '\n❌ Auth error: ' + signInError.message)
        }
      }

      setResult(prev => prev + '\n\n✅ Connection test complete!')
    } catch (err: any) {
      setResult(prev => prev + '\n\n❌ FATAL ERROR: ' + err.message)
      console.error('Connection test error:', err)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Supabase Connection Test</h1>
          
          <button
            onClick={testConnection}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 mb-6"
          >
            {loading ? 'Testing...' : 'Run Connection Test'}
          </button>

          {result && (
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
              {result}
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">What this tests:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Can create Supabase client</li>
              <li>• Can reach Supabase auth endpoint</li>
              <li>• Network/firewall not blocking connection</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
