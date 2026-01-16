import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  // Custom fetch that works around Windows Defender/firewall issues
  const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      // Add retry logic for connection issues
      let lastError
      for (let i = 0; i < 3; i++) {
        try {
          const response = await fetch(input, {
            ...init,
            // Force keep-alive to help with connection issues
            keepalive: true,
          })
          return response
        } catch (err) {
          lastError = err
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
        }
      }
      throw lastError
    } catch (error) {
      console.error('Fetch error:', error)
      throw error
    }
  }

  return createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      fetch: customFetch,
    },
  })
}
