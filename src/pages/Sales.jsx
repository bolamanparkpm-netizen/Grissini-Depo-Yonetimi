import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAudit } from '../hooks/useAudit'
import RoleGuard from '../components/RoleGuard'
import { formatDate } from '../utils/batchUtils'

export default function Sales() {
  const { user, canEdit } = useAuth()
  const { log } = useAudit()
  const [batches, setBatches] = useState([])
  const [form, setForm] = useState({
    batch_id: '',
    sold_kg: '',
    customer: '',
    sale_date: new Date().toISOString().split('T')[0],
  })
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadBatches = () => {
    supabase
      .from('batches')
      .select('*')
      .eq('location', 'depo_b')         // ← Depo B'den
      .eq('quality_status', 'approved')  // ← Kalite onaylı
      .not('status', 'eq', 'consumed')
      .order('production_date', { ascending: false })
      .then(({ data }) => setBatches(data || []))
  }

  useEffect(() => { loadBatches() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const soldKg = parseFloat(form.sold_kg)
      const selectedBatch = batches.find(b => b.id === form.batch_id)
      if (!selectedBatch) throw new Error('Parti seçilmedi')
      if (soldKg <= 0) throw new Error('Geçerli kg miktarı girin')
      if (soldKg > parseFloat(selectedBatch.remaining_kg)) {
        throw new Error(`Maksimum ${selectedBatch.remaining_kg} kg satılabilir`)
      }

      // Satış emrini kaydet
      const { data: order, error: orderError } = await supabase
        .from('sales_orders')
        .insert({
          batch_id: form.batch_id,
          sold_kg: soldKg,
          sale_date: form.sale_date,
          customer: form.customer,
        })
        .select()
        .single()
      if (orderError) throw orderError

      // Batch'i Depo C'ye taşı
      const { error: updateError } = await supabase
        .from('batches')
        .update({
          location: 'depo_c',
          status: 'in_consumption',
          remaining_kg: soldKg,
        })
        .eq('id', form.batch_id)
      if (updateError) throw updateError

      // Hareket kaydı
      await supabase.from('movements').insert({
        batch_id: form.batch_id,
        action: 'transferred',
        from_location: 'depo_b',
        to_location: 'depo_c',
        quantity_kg: soldKg,
        performed_by: user?.email || 'sistem',
        notes: `Satış — Müşteri: ${form.customer}`,
      })

      await log({
        userId: user.id,
        userEmail: user.email,
        action: 'Satış yapıldı — Depo B → Depo C',
        tableName: 'batches',
        recordId: form.batch_id,
        newValues: {
          customer: form.customer,
          sold_kg: soldKg,
          location: 'depo_c',
        },
      })

      setSuccess({
        batch_no: selectedBatch.batch_no,
        customer: form.customer,
        sold_kg: soldKg,
      })

      setForm({
        batch_id: '',
        sold_kg: '',
        customer: '',
        sale_date: new Date().toISOString().split('T')[0],
      })
      loadBatches()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-6">🚚 Satış & Sevk</h2>

      {/* Başarı mesajı */}
      {success && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 mb-4">
          <p className="text-green-700 font-semibold">✅ Satış kaydedildi!</p>
          <p className="text-green-600 text-sm mt-1">
            <span className="font-mono font-bold">{success.batch_no}</span>
            {' '}— {success.sold_kg} kg → {success.customer}
          </p>
          <p className="text-green-500 text-xs mt-1">
            Parti Depo C'ye (Tüketim Deposu) taşındı.
          </p>
          <button
            onClick={() => setSuccess(null)}
            className="mt-3 text-sm text-green-700 underline"
          >
            Yeni satış ekle
          </button>
        </div>
      )}

      <RoleGuard allowed={canEdit('warehouse')}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Parti Seç (Depo B — Satış Deposu)
              </label>
              <select
                value={form.batch_id}
                onChange={(e) => setForm({ ...form, batch_id: e.target.value })}
                className="w-full px-3 py-3 border border-gray-300 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
                required
              >
                <option value="">-- Parti seçin --</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_no} — {b.remaining_kg} kg ({formatDate(b.production_date)})
                  </option>
                ))}
              </select>
              {batches.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Depo B'de satışa hazır stok yok
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Satış Miktarı (kg)
              </label>
              <input
                type="number"
                value={form.sold_kg}
                onChange={(e) => setForm({ ...form, sold_kg: e.target.value })}
                className="w-full px-3 py-3 border border-gray-300 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Müşteri Adı
              </label>
              <input
                type="text"
                value={form.customer}
                onChange={(e) => setForm({ ...form, customer: e.target.value })}
                className="w-full px-3 py-3 border border-gray-300 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
                placeholder="Müşteri / Firma adı"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Satış Tarihi
              </label>
              <input
                type="date"
                value={form.sale_date}
                onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
                className="w-full px-3 py-3 border border-gray-300 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-amber-500 text-base"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3
                              text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || batches.length === 0}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300
                         text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
            >
              {loading ? 'Kaydediliyor...' : '💾 Satışı Kaydet'}
            </button>
          </form>
        </div>
      </RoleGuard>
    </div>
  )
}