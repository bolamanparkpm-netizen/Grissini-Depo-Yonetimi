import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, statusColor } from '../utils/batchUtils'
import { exportToCsv } from '../utils/exportCsv'

export default function Dashboard() {
  const [depoA, setDepoA] = useState([])
  const [depoB, setDepoB] = useState([])
  const [loading, setLoading] = useState(true)

  // Stok verilerini çek
  const fetchStock = async () => {
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .in('status', ['in_stock', 'transferred'])
      .order('production_date', { ascending: false })

    if (error) {
      console.error('Stok yükleme hatası:', error)
      return
    }

    setDepoA(data.filter(b => b.location === 'depo_a'))
    setDepoB(data.filter(b => b.location === 'depo_b'))
    setLoading(false)
  }

  useEffect(() => {
    fetchStock()

// Depo A'daki bekleyen stokları Excel'e aktar
const handleExport = () => {
  const columns = [
    { key: 'batch_no', label: 'Batch No' },
    { key: 'production_date', label: 'Üretim Tarihi' },
    { key: 'quantity_kg', label: 'Üretilen (kg)' },
    { key: 'remaining_kg', label: 'Kalan (kg)' },
    { key: 'status', label: 'Durum' },
  ]

  const rows = depoA.map(b => ({
    ...b,
    production_date: formatDate(b.production_date),
    status: b.status === 'in_stock' ? 'Stokta' : 'Satıldı (transfer bekliyor)',
  }))

  const today = new Date().toISOString().split('T')[0]
  exportToCsv(`depo-a-stok-${today}.csv`, rows, columns)
}
    // Realtime subscription — batches tablosundaki değişiklikleri dinle
    const channel = supabase
      .channel('dashboard-batches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        () => {
          // Herhangi bir değişiklikte yeniden çek
          fetchStock()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const totalA = depoA.reduce((sum, b) => sum + parseFloat(b.remaining_kg || 0), 0)
  const totalB = depoB.reduce((sum, b) => sum + parseFloat(b.remaining_kg || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent
                        rounded-full animate-spin" />
      </div>
    )
  }

  return (
   <div className="flex items-center justify-between mb-4">
  <h2 className="text-xl font-bold text-gray-800">📊 Stok Durumu</h2>
  <button
    onClick={handleExport}
    disabled={depoA.length === 0}
    className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-300
               text-white font-medium px-3 py-2 rounded-lg flex items-center gap-1.5
               transition-colors"
  >
    📥 Excel'e Aktar
  </button>
</div>

      {/* Özet istatistikler */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700 font-medium mb-1">Toplam Depo A</p>
          <p className="text-2xl font-bold text-amber-900">{totalA.toFixed(1)} kg</p>
          <p className="text-xs text-amber-600 mt-1">{depoA.length} parti</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-700 font-medium mb-1">Toplam Depo B</p>
          <p className="text-2xl font-bold text-blue-900">{totalB.toFixed(1)} kg</p>
          <p className="text-xs text-blue-600 mt-1">{depoB.length} parti</p>
        </div>
      </div>

      {/* Depo A Kartı */}
      <StockCard
        title="🏭 Depo A — Üretim Deposu"
        batches={depoA}
        colorClass="amber"
        emptyMsg="Depo A'da stok yok"
      />

      {/* Depo B Kartı */}
      <StockCard
        title="🏪 Depo B — Satış Deposu"
        batches={depoB}
        colorClass="blue"
        emptyMsg="Depo B'de stok yok"
      />
    </div>
  )
}

// Stok kartı alt bileşeni
function StockCard({ title, batches, colorClass, emptyMsg }) {
  const colors = {
    amber: {
      header: 'bg-amber-600 text-white',
      row: 'hover:bg-amber-50',
      badge: 'bg-amber-100 text-amber-800',
    },
    blue: {
      header: 'bg-blue-600 text-white',
      row: 'hover:bg-blue-50',
      badge: 'bg-blue-100 text-blue-800',
    },
  }
  const c = colors[colorClass]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
      <div className={`${c.header} px-4 py-3`}>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>

      {batches.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">{emptyMsg}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {batches.map((batch) => (
            <div key={batch.id} className={`px-4 py-3 ${c.row} transition-colors`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-gray-800">
                    {batch.batch_no}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(batch.production_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">
                    {parseFloat(batch.remaining_kg).toFixed(1)} kg
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.badge}`}>
                    {batch.remaining_kg < batch.quantity_kg
                      ? `${batch.quantity_kg} kg'dan`
                      : 'Tam dolu'
                    }
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 
