import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/batchUtils'

// Hareket türü etiketleri
const ACTION_LABELS = {
  produced:    { label: 'Üretim',   color: 'bg-green-100 text-green-800',  icon: '🏭' },
  sold:        { label: 'Satış',    color: 'bg-blue-100 text-blue-800',    icon: '💰' },
  transferred: { label: 'Transfer', color: 'bg-yellow-100 text-yellow-800', icon: '🚚' },
  consumed:    { label: 'Tüketim',  color: 'bg-gray-100 text-gray-600',    icon: '✅' },
}

// Filtrelenmiş batch için tüketim özeti
const consumptionEvents = movements.filter(m => m.action === 'consumed')
export default function History() {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20 

  useEffect(() => {
    fetchMovements()
  }, [filter, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMovements = async () => {
    setLoading(true)

    let query = supabase
      .from('movements')
      .select(`
        *,
        batches ( batch_no, production_date, quantity_kg )
      `)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    // Batch no filtresi
    if (filter.trim()) {
      query = query.ilike('batches.batch_no', `%${filter.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Geçmiş yükleme hatası:', error)
    } else {
      // Filtre sonuçlarını istemci tarafında da uygula (join filtresi için)
      const filtered = filter.trim()
        ? data.filter(m => m.batches?.batch_no?.includes(filter.trim().toUpperCase()))
        : data
      setMovements(filtered)
    }
    setLoading(false)
  }

  const handleFilterChange = (e) => {
    setFilter(e.target.value.toUpperCase())
    setPage(0)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">📋 Hareket Geçmişi</h2>

      {/* Filtre */}
      <div className="mb-4">
        <input
          type="text"
          value={filter}
          onChange={handleFilterChange}
          placeholder="Batch no ile filtrele (örn: GRS-20240611)"
          className="w-full px-3 py-3 border border-gray-300 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-amber-500
                     font-mono"
        />
      </div>

      {/* Yükleniyor */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent
                          rounded-full animate-spin" />
        </div>
      )}

      {/* Sonuç yok */}
      {!loading && movements.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Kayıt bulunamadı</p>
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="mt-2 text-amber-600 text-sm underline"
            >
              Filtreyi temizle
            </button>
          )}
        </div>
      )}

      {/* Hareket listesi */}
      {!loading && movements.length > 0 && (
        <div className="space-y-2">
          {movements.map((movement) => {
            const action = ACTION_LABELS[movement.action] || {
              label: movement.action,
              color: 'bg-gray-100 text-gray-600',
              icon: '•'
            }
            return (
              <div key={movement.id}
                   className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xl flex-shrink-0">{action.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                                         ${action.color}`}>
                          {action.label}
                        </span>
                        <span className="font-mono text-xs text-gray-600 font-semibold">
                          {movement.batches?.batch_no || '—'}
                        </span>
                      </div>
                      {/* Rota */}
                      <p className="text-xs text-gray-400 mt-1">
                        {movement.from_location
                          ? `${movement.from_location} → ${movement.to_location}`
                          : movement.to_location
                        }
                        {movement.quantity_kg && ` · ${movement.quantity_kg} kg`}
                      </p>
                      {/* Not */}
                      {movement.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {movement.notes}
                        </p>
                      )}
                      {/* Kim yaptı */}
                      <p className="text-xs text-gray-300 mt-0.5">
                        {movement.performed_by}
                      </p>
                    </div>
                  </div>

                  {/* Tarih & saat */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500">
                      {new Date(movement.created_at).toLocaleDateString('tr-TR')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(movement.created_at).toLocaleTimeString('tr-TR', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Sayfalama */}
      {!loading && (
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                       disabled:opacity-40 hover:bg-gray-50"
          >
            ← Önceki
          </button>
          <span className="text-xs text-gray-500">
            Sayfa {page + 1}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={movements.length < PAGE_SIZE}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                       disabled:opacity-40 hover:bg-gray-50"
          >
            Sonraki →
          </button>
        </div>
      )}
    </div>
  )
} 
