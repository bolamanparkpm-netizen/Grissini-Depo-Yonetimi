import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/batchUtils'
import { exportToCsv } from '../utils/exportCsv'

const ACTION_LABELS = {
  produced:           { label: 'Üretim',         color: 'bg-green-100 text-green-800',   icon: '🏭' },
  sold:               { label: 'Satış',           color: 'bg-blue-100 text-blue-800',     icon: '💰' },
  transferred:        { label: 'Transfer',        color: 'bg-yellow-100 text-yellow-800', icon: '🚚' },
  consumed:           { label: 'Tüketim',         color: 'bg-gray-100 text-gray-600',     icon: '✅' },
  quality_approved:   { label: 'Kalite Onayı',   color: 'bg-green-100 text-green-700',   icon: '✅' },
  quality_rejected:   { label: 'Kalite Red',     color: 'bg-red-100 text-red-700',       icon: '❌' },
  quality_quarantine: { label: 'Karantina',      color: 'bg-orange-100 text-orange-700', icon: '🔬' },
}

export default function History() {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => {
    fetchMovements()
  }, [filter, dateFrom, dateTo, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMovements = async () => {
    setLoading(true)

    let query = supabase
      .from('movements')
      .select(`*, batches ( batch_no, production_date, quantity_kg, shift )`)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    // Tarih aralığı filtresi
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00')
    if (dateTo)   query = query.lte('created_at', dateTo   + 'T23:59:59')

    const { data, error } = await query

    if (error) {
      console.error('Geçmiş yükleme hatası:', error)
      setLoading(false)
      return
    }

    // Batch no filtresi (istemci tarafı)
    const filtered = filter.trim()
      ? data.filter(m => m.batches?.batch_no?.includes(filter.trim().toUpperCase()))
      : data

    setMovements(filtered)
    setLoading(false)
  }

  const handleFilterChange = (e) => {
    setFilter(e.target.value.toUpperCase())
    setPage(0)
  }

  // Tüm kayıtları çekip Excel'e aktar (sayfalama olmaksızın)
  const handleExport = async () => {
    let query = supabase
      .from('movements')
      .select(`*, batches ( batch_no, production_date, quantity_kg, shift )`)
      .order('created_at', { ascending: false })

    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00')
    if (dateTo)   query = query.lte('created_at', dateTo   + 'T23:59:59')

    const { data, error } = await query
    if (error) { alert('Export hatası: ' + error.message); return }

    const filtered = filter.trim()
      ? data.filter(m => m.batches?.batch_no?.includes(filter.trim().toUpperCase()))
      : data

    const columns = [
      { key: 'tarih',       label: 'Tarih' },
      { key: 'saat',        label: 'Saat' },
      { key: 'batch_no',    label: 'Batch No' },
      { key: 'vardiya',     label: 'Vardiya' },
      { key: 'islem',       label: 'İşlem' },
      { key: 'miktar_kg',   label: 'Miktar (kg)' },
      { key: 'nereden',     label: 'Nereden' },
      { key: 'nereye',      label: 'Nereye' },
      { key: 'yapan',       label: 'Yapan' },
      { key: 'notlar',      label: 'Notlar' },
    ]

    const rows = filtered.map(m => ({
      tarih:     new Date(m.created_at).toLocaleDateString('tr-TR'),
      saat:      new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      batch_no:  m.batches?.batch_no || '—',
      vardiya:   m.batches?.shift || '—',
      islem:     ACTION_LABELS[m.action]?.label || m.action,
      miktar_kg: m.quantity_kg || '',
      nereden:   m.from_location || '—',
      nereye:    m.to_location || '—',
      yapan:     m.performed_by || '—',
      notlar:    m.notes || '',
    }))

    const label = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : 'tum'
    exportToCsv(`hareket-gecmisi-${label}.csv`, rows, columns)
  }

  const consumptionEvents = movements.filter(m => m.action === 'consumed')

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">📋 Hareket Geçmişi</h2>
        <button
          onClick={handleExport}
          className="text-sm bg-green-600 hover:bg-green-700 text-white
                     font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"
        >
          📥 Excel'e Aktar
        </button>
      </div>

      {/* Filtreler */}
      <div className="space-y-2 mb-4">
        {/* Batch no filtresi */}
        <input
          type="text"
          value={filter}
          onChange={handleFilterChange}
          placeholder="Batch no ile filtrele (örn: GRS-20240611)"
          className="w-full px-3 py-3 border border-gray-300 rounded-xl text-sm
                     focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
        />

        {/* Tarih aralığı */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Başlangıç Tarihi</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bitiş Tarihi</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Aktif filtre özeti */}
        {(filter || dateFrom || dateTo) && (
          <div className="flex items-center justify-between bg-amber-50
                          border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-700">
              {filter && <span>Batch: <b>{filter}</b> </span>}
              {dateFrom && <span>· {dateFrom}</span>}
              {dateTo && <span> → {dateTo}</span>}
            </p>
            <button
              onClick={() => { setFilter(''); setDateFrom(''); setDateTo(''); setPage(0) }}
              className="text-xs text-amber-600 underline"
            >
              Temizle
            </button>
          </div>
        )}
      </div>

      {/* Tüketim özet kutusu */}
      {filter && consumptionEvents.length > 0 && (
        <div className="bg-gray-900 text-white rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold mb-2">
            🔍 {filter} — Tüketim Kayıtları (Geri Çağırma)
          </p>
          {consumptionEvents.map(m => (
            <p key={m.id} className="text-xs text-gray-300">
              • {new Date(m.created_at).toLocaleString('tr-TR', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })} — {m.quantity_kg} kg — {m.performed_by}
            </p>
          ))}
        </div>
      )}

      {/* Yükleniyor */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent
                          rounded-full animate-spin" />
        </div>
      )}

      {/* Sonuç yok */}
      {!loading && movements.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Kayıt bulunamadı</p>
        </div>
      )}

      {/* Hareket listesi */}
      {!loading && movements.length > 0 && (
        <div className="space-y-2">
          {movements.map((movement) => {
            const action = ACTION_LABELS[movement.action] || {
              label: movement.action, color: 'bg-gray-100 text-gray-600', icon: '•'
            }
            return (
              <div key={movement.id}
                   className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xl flex-shrink-0">{action.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${action.color}`}>
                          {action.label}
                        </span>
                        <span className="font-mono text-xs text-gray-600 font-semibold">
                          {movement.batches?.batch_no || '—'}
                        </span>
                        {movement.batches?.shift && (
                          <span className="text-xs text-gray-400">
                            {movement.batches.shift === 'sabah' ? '🌅' :
                             movement.batches.shift === 'aksam' ? '🌆' : '🌙'}
                            {movement.batches.shift}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {movement.from_location
                          ? `${movement.from_location} → ${movement.to_location}`
                          : movement.to_location}
                        {movement.quantity_kg && ` · ${movement.quantity_kg} kg`}
                      </p>
                      {movement.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{movement.notes}</p>
                      )}
                      <p className="text-xs text-gray-300 mt-0.5">{movement.performed_by}</p>
                    </div>
                  </div>
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
          >← Önceki</button>
          <span className="text-xs text-gray-500">Sayfa {page + 1}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={movements.length < PAGE_SIZE}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                       disabled:opacity-40 hover:bg-gray-50"
          >Sonraki →</button>
        </div>
      )}
    </div>
  )
}