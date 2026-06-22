import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAudit } from '../hooks/useAudit'
import BarcodeLabel from '../components/BarcodeLabel'
import RoleGuard from '../components/RoleGuard'

export default function Production() {
  const { user, canEdit } = useAuth()
  const { log } = useAudit()
  const [form, setForm] = useState({
    batch_no: '',
    production_date: new Date().toISOString().split('T')[0],
    quantity_kg: '',
    shift: 'sabah',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdBatch, setCreatedBatch] = useState(null)
  const [showBarcode, setShowBarcode] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const qty = parseFloat(form.quantity_kg)
      if (isNaN(qty) || qty <= 0) throw new Error('Geçerli bir kg miktarı girin')
      const batchNo = form.batch_no.trim().toUpperCase()
      if (!batchNo) throw new Error('Batch numarası girin')

      const { data: batch, error: insertError } = await supabase
        .from('batches')
        .insert({
          batch_no: batchNo,
          production_date: form.production_date,
          quantity_kg: qty,
          remaining_kg: qty,
          location: 'depo_a',
          status: 'in_stock',
          quality_status: 'pending',
          shift: form.shift,
        })
        .select()
        .single()
      if (insertError) throw insertError

      await supabase.from('movements').insert({
        batch_id: batch.id,
        action: 'produced',
        from_location: null,
        to_location: 'depo_a',
        quantity_kg: qty,
        performed_by: user?.email || 'sistem',
        notes: `Üretim girişi — ${batchNo} — ${form.shift} vardiyası`,
      })

      await log({
        userId: user.id,
        userEmail: user.email,
        action: 'Üretim girişi yapıldı',
        tableName: 'batches',
        recordId: batch.id,
        newValues: { batch_no: batchNo, quantity_kg: qty, shift: form.shift },
      })

      setCreatedBatch(batch)
      setShowBarcode(true)
      setForm({
        batch_no: '',
        production_date: new Date().toISOString().split('T')[0],
        quantity_kg: '',
        shift: 'sabah',
      })
    } catch (err) {
      console.error('Üretim kayıt hatası:', err)
      setError(err.message || 'Kayıt sırasında hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-6">🏭 Üretim Girişi</h2>
      <RoleGuard allowed={canEdit('production')}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Batch Numarası
              </label>
              <input
                type="text"
                value={form.batch_no}
                onChange={(e) => setForm({ ...form, batch_no: e.target.value.toUpperCase() })}
                className="w-full px-3 py-3 border border-gray-300 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-amber-500 text-base
                           font-mono uppercase"
                placeholder="GRS-20260612-001"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Aynı batch koduyla birden fazla paket girebilirsiniz
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Üretim Tarihi
              </label>
              <input
                type="date"
                value={form.production_date}
                onChange={(e) => setForm({ ...form, production_date: e.target.value })}
                className="w-full px-3 py-3 border border-gray-300 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Vardiya
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'sabah', label: '🌅 Sabah' },
                  { value: 'aksam', label: '🌆 Akşam' },
                  { value: 'gece',  label: '🌙 Gece' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, shift: opt.value })}
                    className={`py-3 rounded-xl text-sm font-medium transition-colors
                      ${form.shift === opt.value
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Üretim Miktarı (kg)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={form.quantity_kg}
                  onChange={(e) => setForm({ ...form, quantity_kg: e.target.value })}
                  className="w-full px-3 py-3 pr-12 border border-gray-300 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2
                                 text-gray-400 text-sm font-medium">kg</span>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3
                              text-sm text-red-700 flex items-start gap-2">
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300
                         text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent
                                   rounded-full animate-spin" />
                  Kaydediliyor...
                </span>
              ) : '💾 Kaydet & Barkod Oluştur'}
            </button>
          </form>
        </div>
      </RoleGuard>

      {showBarcode && createdBatch && (
        <BarcodeLabel
          batch={createdBatch}
          onClose={() => { setShowBarcode(false); setCreatedBatch(null) }}
        />
      )}
    </div>
  )
}