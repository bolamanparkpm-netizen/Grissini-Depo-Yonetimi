import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/batchUtils'
import { exportToCsv } from '../utils/exportCsv'

export default function Dashboard() {
  const [depoA, setDepoA] = useState([])
  const [depoB, setDepoB] = useState([])
  const [depoC, setDepoC] = useState([])
  const [karantina, setKarantina] = useState([])
  const [loading, setLoading] = useState(true)
  const [sevkBekleyen, setSevkBekleyen] = useState([])
  // fetchStock içinde:
  setSevkBekleyen(data.filter(b => b.status === 'sevk_bekliyor'))

const fetchStock = async () => {
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .not('status', 'in', '("consumed","rejected")')
    .order('production_date', { ascending: false })

  if (error) { console.error(error); return }

  setDepoA(data.filter(b => b.location === 'depo_a'))
	// Depo B — sadece transferred olanlar (sevk_bekliyor ayrı göster)
  setDepoB(data.filter(b => b.location === 'depo_b' && b.status === 'transferred'))
	// Sevk bekleyenler — Depo B'de ama satış emri verilmiş
  const sevkBekleyen = data.filter(b => b.status === 'sevk_bekliyor')
  setDepoC(data.filter(b => b.location === 'depo_c'))
  setKarantina(data.filter(b => b.location === 'depo_karantina'))

  setLoading(false)
}

  useEffect(() => {
    fetchStock()
    const channel = supabase
      .channel('dashboard-batches')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        () => fetchStock()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const handleExport = () => {
    const columns = [
      { key: 'batch_no',        label: 'Batch No' },
      { key: 'production_date', label: 'Üretim Tarihi' },
      { key: 'quantity_kg',     label: 'Üretilen (kg)' },
      { key: 'remaining_kg',    label: 'Kalan (kg)' },
      { key: 'quality_status',  label: 'Kalite' },
      { key: 'location',        label: 'Konum' },
    ]
    const rows = depoA.map(b => ({
      ...b,
      production_date: formatDate(b.production_date),
      quality_status:
        b.quality_status === 'approved'   ? 'Onaylı' :
        b.quality_status === 'pending'    ? 'Bekliyor' :
        b.quality_status === 'quarantine' ? 'Karantina' : 'Red',
      location: 'Depo A',
    }))
    const today = new Date().toISOString().split('T')[0]
    exportToCsv(`depo-a-stok-${today}.csv`, rows, columns)
  }

  const totalA = depoA.reduce((s, b) => s + parseFloat(b.remaining_kg || 0), 0)
  const totalB = depoB.reduce((s, b) => s + parseFloat(b.remaining_kg || 0), 0)
  const totalC = depoC.reduce((s, b) => s + parseFloat(b.remaining_kg || 0), 0)
  const totalKarantina = karantina.reduce((s, b) => s + parseFloat(b.remaining_kg || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent
                        rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">📊 Stok Durumu</h2>
        <button
          onClick={handleExport}
          disabled={depoA.length === 0}
          className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-300
                     text-white font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"
        >
          📥 Excel'e Aktar
        </button>
      </div>

      {/* Özet kartlar — 4 kolon */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-700 font-medium mb-1">🏭 Depo A — Üretim</p>
          <p className="text-xl font-bold text-amber-900">{totalA.toFixed(1)} kg</p>
          <p className="text-xs text-amber-600 mt-0.5">{depoA.length} parti</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-xs text-blue-700 font-medium mb-1">🏪 Depo B — Satış</p>
          <p className="text-xl font-bold text-blue-900">{totalB.toFixed(1)} kg</p>
          <p className="text-xs text-blue-600 mt-0.5">{depoB.length} parti</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <p className="text-xs text-purple-700 font-medium mb-1">🍽️ Depo C — Tüketim</p>
          <p className="text-xl font-bold text-purple-900">{totalC.toFixed(1)} kg</p>
          <p className="text-xs text-purple-600 mt-0.5">{depoC.length} parti</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
          <p className="text-xs text-orange-700 font-medium mb-1">🔬 Karantina</p>
          <p className="text-xl font-bold text-orange-900">{totalKarantina.toFixed(1)} kg</p>
          <p className="text-xs text-orange-600 mt-0.5">{karantina.length} parti</p>
        </div>
 	<div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-2">
    	<p className="text-xs text-yellow-700 font-medium mb-1">⏳ Sevk Bekliyor</p>
   	<p className="text-xl font-bold text-yellow-900">
    	{sevkBekleyen.reduce((s, b) => s + parseFloat(b.remaining_kg || 0), 0).toFixed(1)} kg
   	</p>
    	<p className="text-xs text-yellow-600 mt-0.5">{sevkBekleyen.length} parti</p>
  	</div>
      </div>

      <StockCard
        title="🏭 Depo A — Üretim Deposu"
        batches={depoA}
        colorClass="amber"
        emptyMsg="Depo A'da stok yok"
        showQuality
      />
      <StockCard
        title="🏪 Depo B — Satış Deposu"
        batches={depoB}
        colorClass="blue"
        emptyMsg="Depo B'de stok yok"
      />
      <StockCard
        title="🍽️ Depo C — Tüketim Deposu"
        batches={depoC}
        colorClass="purple"
        emptyMsg="Depo C'de stok yok"
      />
      {karantina.length > 0 && (
        <StockCard
          title="🔬 Karantina Deposu"
          batches={karantina}
          colorClass="orange"
          emptyMsg=""
        />
      )}
    </div>
  )
}

function StockCard({ title, batches, colorClass, emptyMsg, showQuality, showLocation }) {
  const colors = {
    amber:  { header: 'bg-amber-600 text-white',  row: 'hover:bg-amber-50',  badge: 'bg-amber-100 text-amber-800' },
    blue:   { header: 'bg-blue-600 text-white',   row: 'hover:bg-blue-50',   badge: 'bg-blue-100 text-blue-800' },
    purple: { header: 'bg-purple-600 text-white', row: 'hover:bg-purple-50', badge: 'bg-purple-100 text-purple-800' },
    orange: { header: 'bg-orange-500 text-white', row: 'hover:bg-orange-50', badge: 'bg-orange-100 text-orange-800' },
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
                    {showLocation && (
                      <span className="ml-2 text-orange-600">
                        · {batch.location === 'depo_a' ? 'Depo A' :
                           batch.location === 'depo_b' ? 'Depo B' :
                           batch.location === 'depo_c' ? 'Depo C' : batch.location}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">
                    {parseFloat(batch.remaining_kg).toFixed(1)} kg
                  </p>
                  <div className="flex gap-1 justify-end mt-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.badge}`}>
                      {batch.remaining_kg < batch.quantity_kg
                        ? `/ ${batch.quantity_kg} kg`
                        : 'Tam dolu'}
                    </span>
                    {showQuality && batch.quality_status !== 'approved' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full
                        ${batch.quality_status === 'pending'
                          ? 'bg-gray-100 text-gray-600'
                          : batch.quality_status === 'quarantine'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-red-100 text-red-700'}`}>
                        {batch.quality_status === 'pending'    ? '⏳ Bekliyor' :
                         batch.quality_status === 'quarantine' ? '🔬 Karantina' : '❌ Red'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}