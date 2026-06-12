import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatDate } from '../utils/batchUtils'

// Kalite durumu tanımları
const QUALITY_LABELS = {
  pending:    { label: 'Analiz Bekliyor', color: 'bg-gray-100 text-gray-700',   icon: '⏳' },
  approved:   { label: 'Satışa Uygun',    color: 'bg-green-100 text-green-700', icon: '✅' },
  rejected:   { label: 'Uygun Değil',     color: 'bg-red-100 text-red-700',     icon: '❌' },
  quarantine: { label: 'Karantina',       color: 'bg-orange-100 text-orange-700', icon: '🔬' },
}

export default function Quality() {
  const { user } = useAuth()
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('pending') // varsayılan: bekleyenler
  const [noteDrafts, setNoteDrafts] = useState({}) // her batch için not taslağı
  const [actingId, setActingId] = useState(null)   // işlem yapılan batch id

  const fetchBatches = async () => {
    setLoading(true)
    let query = supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') {
      query = query.eq('quality_status', filterStatus)
    }

    const { data, error } = await query
    if (error) {
      console.error('Kalite listesi yükleme hatası:', error)
    } else {
      setBatches(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchBatches()
  }, [filterStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kalite durumunu güncelle
  const handleSetStatus = async (batch, newStatus) => {
    setActingId(batch.id)
    try {
      const note = noteDrafts[batch.id] || ''

      const { error: updateError } = await supabase
        .from('batches')
        .update({
          quality_status: newStatus,
          quality_notes: note || null,
        })
        .eq('id', batch.id)

      if (updateError) throw updateError

      // Hareket kaydı oluştur
      const actionMap = {
        approved: 'quality_approved',
        rejected: 'quality_rejected',
        quarantine: 'quality_quarantine',
      }

      await supabase.from('movements').insert({
        batch_id: batch.id,
        action: actionMap[newStatus],
        from_location: batch.location,
        to_location: batch.location,
        quantity_kg: batch.remaining_kg,
        performed_by: user?.email || 'sistem',
        notes: note || QUALITY_LABELS[newStatus].label,
      })

      // Listeyi güncelle
      fetchBatches()
    } catch (err) {
      alert('Hata: ' + err.message)
    } finally {
      setActingId(null)
    }
  }

  const filters = [
    { key: 'pending', label: '⏳ Bekleyen' },
    { key: 'quarantine', label: '🔬 Karantina' },
    { key: 'approved', label: '✅ Uygun' },
    { key: 'rejected', label: '❌ Uygun Değil' },
    { key: 'all', label: 'Tümü' },
  ]

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">🧪 Kalite Kontrol</h2>

      {/* Durum filtreleri */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`flex-shrink-0 text-sm px-3 py-2 rounded-lg font-medium
                        transition-colors whitespace-nowrap
                        ${filterStatus === f.key
                          ? 'bg-amber-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Yükleniyor */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent
                          rounded-full animate-spin" />
        </div>
      )}

      {/* Sonuç yok */}
      {!loading && batches.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Bu kategoride parti bulunamadı</p>
        </div>
      )}

      {/* Batch listesi */}
      {!loading && batches.length > 0 && (
        <div className="space-y-3">
          {batches.map((batch) => {
            const q = QUALITY_LABELS[batch.quality_status] || QUALITY_LABELS.pending
            const isActing = actingId === batch.id

            return (
              <div key={batch.id}
                   className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                {/* Üst satır: batch bilgisi + durum */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-gray-800">
                      {batch.batch_no}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(batch.production_date)} · {batch.quantity_kg} kg
                      · {batch.location === 'depo_a' ? 'Depo A' : batch.location === 'depo_b' ? 'Depo B' : batch.location}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${q.color}`}>
                    {q.icon} {q.label}
                  </span>
                </div>

                {/* Önceki not varsa göster */}
                {batch.quality_notes && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-2">
                    📝 {batch.quality_notes}
                  </p>
                )}

                {/* Not girişi */}
                <input
                  type="text"
                  placeholder="Not ekle (opsiyonel — örn: Lab raporu no, sebep...)"
                  value={noteDrafts[batch.id] ?? ''}
                  onChange={(e) => setNoteDrafts({ ...noteDrafts, [batch.id]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3
                             focus:outline-none focus:ring-2 focus:ring-amber-500"
                />

                {/* Aksiyon butonları */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleSetStatus(batch, 'approved')}
                    disabled={isActing || batch.quality_status === 'approved'}
                    className="py-2 rounded-lg text-xs font-semibold transition-colors
                               bg-green-50 text-green-700 hover:bg-green-100
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ✅ Uygun
                  </button>
                  <button
                    onClick={() => handleSetStatus(batch, 'quarantine')}
                    disabled={isActing || batch.quality_status === 'quarantine'}
                    className="py-2 rounded-lg text-xs font-semibold transition-colors
                               bg-orange-50 text-orange-700 hover:bg-orange-100
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    🔬 Karantina
                  </button>
                  <button
                    onClick={() => handleSetStatus(batch, 'rejected')}
                    disabled={isActing || batch.quality_status === 'rejected'}
                    className="py-2 rounded-lg text-xs font-semibold transition-colors
                               bg-red-50 text-red-700 hover:bg-red-100
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ❌ Uygun Değil
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
