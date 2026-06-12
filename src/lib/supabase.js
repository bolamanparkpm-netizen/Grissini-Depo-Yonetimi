import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase ortam değişkenleri eksik! .env dosyasını kontrol et.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,    // Oturumu localStorage'da sakla
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,   // Ücretsiz tier için makul limit
    }
  }
})
