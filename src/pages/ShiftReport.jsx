import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { exportToCsv } from '../utils/exportCsv'

const SHIFT_ICONS = { sabah: '🌅', aksam: '🌆', gece: '🌙' }

export default function ShiftReport() {
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [data, setData] = useState([])
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(false)

  // Vardiya hedeflerini çek
  useEffect(() => {
    supabase
      .from('shift_targets')
      .select('*')
      .order('target_kg', { ascending: true })
      .then(({ data }) => setTargets(data || []))
  }, [])

  const fetchReport = async () => {
    setLoading(true)
    const { data: batches, error } = await supabase
      .from('batches')
      .select('*')
      .eq('production_date', reportDate)
      .not('shift', 'is', null)
      .order('created_at', { ascending: true })

    if (error) { console.error(error); setLoading(false); return }

    // Vardiyaya göre grupla
    const grouped = { sabah: [], aksam: [], gece: [] }
    batches.forEach(b => { if (grouped[b.shift]) grouped[b.shift].push(b) })

    const result = ['sabah', 'aksam', 'gece'].map(shift => {
      const shiftBatches = grouped[shift]
      const totalKg = shiftBatches.reduce((s, b) => s + parseFloat(b.quantity_kg || 0), 0)

      // O vardiya için geçerli hedefleri bul
      const shiftTargets = targets.filter(t => t.shift === shift)
        .sort((a, b) => a.target_kg - b.target_kg)

      // Hangi hedefe ulaşıldı?
      const achievedTarget = [...shiftTargets]
        .reverse()
        .find(t => totalKg >= t.target_kg)

      return {
        shift,
        batches: shiftBatches,
        totalKg,
        targets: shiftTargets,
        achievedTarget,
      }
    })

    setData(result)
    setLoading(false)
  }

  useEffect(() => {
    if (targets.length > 0) fetchReport()
  }, [reportDate, targets]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = () => {
    const columns = [
      { key: 'tarih',     label: 'Tarih' },
      { key: 'vardiya',   label: 'Vardiya' },
      { key: 'batch_no',  label: 'Batch No' },
      { key: 'miktar_kg', label: 'Miktar (kg)' },
      { key: 'hedef_kg',  label: 'Hedef (kg)' },
      { key: 'prim',      label: 'Kazanılan Prim (₺)' },
    ]

    const rows = data.flatMap(d =>
      d.batches.map(b => ({
        tarih:     reportDate,
        vardiya:   d.shift,
        batch_no:  b.batch_no,
        miktar_kg: b.quantity_kg,
        hedef_kg:  d.achievedTarget?.target_kg || '—',
        prim:      d.achievedTarget?.bonus_amount || 0,
      }))
    )

    exportToCsv(`vardiya-raporu-${reportDate}.csv`, rows, columns)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">📈 Vardiya Raporu</h2>
        <button
          onClick={handleExport}
          disabled={data.length === 0}
          className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-300
                     text-white font-medium px-3 py-2 rounded-lg"
        >
          📥 Excel'e Aktar
        </button>
      </div>

      {/* Tarih seçimi */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Rapor Tarihi
        </label>
        <input
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base
                     focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent
                          rounded-full animate-spin" />
        </div>
      )}

      {/* Vardiya kartları */}
      {!loading && data.map(({ shift, batches, totalKg, targets: shiftTargets, achievedTarget }) => (
        <div key={shift} className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
          {/* Başlık */}
          <div className={`px-4 py-3 flex items-center justify-between
            ${achievedTarget ? 'bg-green-600' : totalKg > 0 ? 'bg-amber-600' : 'bg-gray-400'} text-white`}>
            <div>
              <span className="font-semibold">
                {SHIFT_ICONS[shift]} {shift.charAt(0).toUpperCase() + shift.slice(1)} Vardiyası
              </span>
              <span className="text-sm ml-2 opacity-80">
                — Toplam: {totalKg.toFixed(1)} kg
              </span>
            </div>
            {achievedTarget && (
              <div className="text-right text-sm">
                <p className="font-bold">🎯 {achievedTarget.target_kg} kg hedef aşıldı</p>
                <p className="opacity-90">Prim: ₺{achievedTarget.bonus_amount}</p>
              </div>
            )}
          </div>

          {/* Hedef çubuğu */}
          {shiftTargets.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              {shiftTargets.map(t => {
                const pct = Math.min((totalKg / t.target_kg) * 100, 100)
                const achieved = totalKg >= t.target_kg
                return (
                  <div key={t.id} className="mb-2 last:mb-0">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{t.target_kg} kg hedef → ₺{t.bonus_amount} prim</span>
                      <span className={achieved ? 'text-green-600 font-bold' : ''}>
                        {achieved ? '✅ Ulaşıldı' : `%${pct.toFixed(0)}`}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${achieved ? 'bg-green-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Batch listesi */}
          {batches.length === 0 ? (
            <p className="p-4 text-center text-gray-400 text-sm">Bu vardiyada üretim yok</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {batches.map(b => (
                <div key={b.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm font-semibold text-gray-700">{b.batch_no}</p>
                    <p className="text-xs text-gray-400">
                      {b.quality_status === 'approved' ? '✅ Onaylı' :
                       b.quality_status === 'pending'  ? '⏳ Bekliyor' :
                       b.quality_status === 'quarantine' ? '🔬 Karantina' : '❌ Red'}
                    </p>
                  </div>
                  <p className="font-bold text-gray-700">{b.quantity_kg} kg</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}