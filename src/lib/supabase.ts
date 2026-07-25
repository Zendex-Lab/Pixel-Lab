import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

const realSupabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  ''

const realSupabaseAnonKey =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
  ''

// Mock Supabase to allow the app to run offline/without a real Supabase backend
const createMockSupabase = () => {
  console.log('🛠️ Using mock Supabase client for offline/local testing.')

  const mockSession = {
    access_token: 'mock-token',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh-token',
    user: {
      id: 'mock-user-uuid-1234',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'designer@zendex.lab',
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: { username: 'ZendexUser' },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }

  const mockProfile = {
    id: 'mock-user-uuid-1234',
    username: 'ZendexUser',
    is_admin: true,
    charges: 100,
    max_charges: 100,
    last_regen_time: new Date().toISOString(),
    last_shop_purchase_at: null,
  }

  const mockClient = {
    auth: {
      signUp: async ({ email, password, options }: any) => {
        return {
          data: { user: mockSession.user, session: mockSession },
          error: null,
        }
      },
      signInWithPassword: async ({ email, password }: any) => {
        return {
          data: { user: mockSession.user, session: mockSession },
          error: null,
        }
      },
      signOut: async () => {
        return { error: null }
      },
      getSession: async () => {
        return { data: { session: mockSession }, error: null }
      },
      onAuthStateChange: (callback: any) => {
        // Trigger callback with mock session
        setTimeout(() => callback('SIGNED_IN', mockSession), 0)
        return {
          data: {
            subscription: {
              unsubscribe: () => {},
            },
          },
        }
      },
    },
    from: (table: string) => {
      return {
        select: (columns: string = '*') => {
          return {
            eq: (col: string, val: any) => {
              return {
                single: async () => {
                  if (table === 'user_profiles') {
                    return { data: mockProfile, error: null }
                  }
                  return { data: null, error: null }
                },
                async then(resolve: any) {
                  if (table === 'user_profiles') {
                    resolve({ data: mockProfile, error: null })
                  } else {
                    resolve({ data: [], error: null })
                  }
                },
              }
            },
            range: async (from: number, to: number) => {
              if (table === 'pixels') {
                return { data: [], error: null }
              }
              return { data: [], error: null }
            },
            async then(resolve: any) {
              resolve({ data: [], error: null })
            },
          }
        },
        upsert: async (payload: any, options?: any) => {
          return { data: payload, error: null }
        },
        update: async (payload: any) => {
          return {
            eq: (col: string, val: any) => {
              return { data: payload, error: null }
            },
          }
        },
      }
    },
    channel: (name: string) => {
      return {
        on: (event: string, filter: any, callback: any) => {
          return {
            subscribe: (statusCallback: any) => {
              if (statusCallback) {
                setTimeout(() => statusCallback('SUBSCRIBED'), 0)
              }
              return { unsubscribe: () => {} }
            },
          }
        },
      }
    },
    removeChannel: (channel: any) => {},
  }

  return mockClient as any
}

const hasCredentials = Boolean(realSupabaseUrl && realSupabaseAnonKey)

if (!hasCredentials) {
  console.warn(
    '⚠️ Supabase environment variables are missing! Falling back to offline mock client.',
  )
}

export const supabase = hasCredentials
  ? createClient<Database>(realSupabaseUrl, realSupabaseAnonKey)
  : createMockSupabase()
