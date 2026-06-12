import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import BarcodeLabel from '../components/BarcodeLabel'

export default function Production() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    production_date: new Date().toISOString().split('T')[0],
    quantity_kg: '',
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

      // 1. Supabase fonksiyonundan batch no al
      const { data: batchNoData, error: fnError } = await supabase
        .rpc('generate_batch_no', { p_date: form.production_date })
      if (fnError) throw fnError

      const batchNo = batchNoData

      // 2. Batch'i kaydet
      const { data: batch, error: insertError } = await supabase
        .from('batches')
        .insert({
          batch_no: batchNo,
          production_date: form.production_date,
          quantity_kg: qty,
          remaining_kg: qty,
          location: 'depo_a',
          status: 'in_stock',
        })
        .select()
        .single()

      if (insertError) throw insertError

      // 3. Hareket kaydı oluştur
      await supabase.from('movements').insert({
        batch_id: batch.id,
        action: 'produced',
        from_location: null,
        to_location: 'depo_a',
        quantity_kg: qty,
        performed_by: user?.email || 'sistem',
        notes: `Üretim girişi — ${batchNo}`,
      })

      // 4. Barkod göster
      setCreatedBatch(batch)
      setShowBarcode(true)

      // Form'u sıfırla
      setForm({
        production_date: new Date().toISOString().split('T')[0],
        quantity_kg: '',
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Üretim tarihi */}
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

          {/* Kg miktarı */}
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
                               text-gray-400 text-sm font-medium">
                kg
              </span>
            </div>
          </div>

          {/* Hata mesajı */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3
                            text-sm text-red-700 flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Kaydet butonu */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300
                       text-white font-semibold py-3.5 rounded-xl transition-colors
                       text-base active:scale-95"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent
                                 rounded-full animate-spin" />
                Kaydediliyor...
              </span>
            ) : (
              '💾 Kaydet & Barkod Oluştur'
            )}
          </button>
        </form>

        {/* Bilgi notu */}
        <p className="text-xs text-gray-400 mt-4 text-center">
          Batch numarası otomatik oluşturulur (GRS-YYYYMMDD-XXX)
        </p>
      </div>

      {/* Barkod modal */}
      {showBarcode && createdBatch && (
        <BarcodeLabel
          batch={createdBatch}
          onClose={() => {
            setShowBarcode(false)
            setCreatedBatch(null)
          }}
        />
      )}
    </div>
  )
} 
