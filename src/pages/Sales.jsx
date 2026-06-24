import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAudit } from '../hooks/useAudit'
import BarcodeScanner from '../components/BarcodeScanner'
import HardwareScannerInput from '../components/HardwareScannerInput'
import RoleGuard from '../components/RoleGuard'
import { formatDate } from '../utils/batchUtils'

const TAB = { ORDER: 'order', PENDING: 'pending' }

export default function Sales() {
  const { user, canEdit } = useAuth()
  const { log } = useAudit()
  const [tab, setTab] = useState(TAB.ORDER)

  // Satış emri formu
  const [batches, setBatches] = useState([])
  const [form, setForm] = useState({
    batch_id: '',
    sold_kg: '',
    customer: '',
    sale_date: new Date().toISOString().split('T')[0],
  })
  const [orderSuccess, setOrderSuccess] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Sevk bekleyenler
  const [pendingBatches, setPendingBatches] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [pendingLoading, setPendingLoading] = useState(false)

  // Depo B'deki satışa hazır stokları yükle
  const loadBatches = () => {
    supabase
      .from('batches')
      .select('*')
      .eq('location', 'depo_b')
      .eq('quality_status', 'approved')
      .eq('status', 'transferred')
      .order('production_date', { ascending: false })
      .then(({ data }) => setBatches(data || []))
  }

  // Sevk bekleyen (satış emri verilmiş ama fiziki transfer olmamış) partileri yükle
  const loadPendingBatches = () => {
    setPendingLoading(true)
    supabase
      .from('batches')
      .select(`
        *,
        sales_orders ( customer, sold_kg, sale_date )
      `)
      .eq('status', 'sevk_bekliyor')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPendingBatches(data || [])
        setPendingLoading(false)
      })
  }

  useEffect(() => {
    loadBatches()
    loadPendingBatches()
  }, [])

  useEffect(() => {
    if (tab === TAB.PENDING) loadPendingBatches()
    if (tab === TAB.ORDER) loadBatches()
  }, [tab])

  // ADIM 1: Satış emri kaydet — Depo B'den düş, sevk_bekliyor'a al
  const handleSaveOrder = async (e) => {
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

      // Depo B'den düş, sevk_bekliyor durumuna al
      const newRemaining = parseFloat(selectedBatch.remaining_kg) - soldKg
      const { error: updateError } = await supabase
        .from('batches')
        .update({
          status: 'sevk_bekliyor',
          remaining_kg: newRemaining,
          // Location hala depo_b — fiziki transfer olmadı
        })
        .eq('id', form.batch_id)
      if (updateError) throw updateError

      // Hareket kaydı
      await supabase.from('movements').insert({
        batch_id: form.batch_id,
        action: 'sold',
        from_location: 'depo_b',
        to_location: 'depo_b',
        quantity_kg: soldKg,
        performed_by: user?.email || 'sistem',
        notes: `Satis emri — Musteri: ${form.customer} — Sevk bekliyor`,
      })

      await log({
        userId: user.id,
        userEmail: user.email,
        action: 'Satis emri olusturuldu — sevk bekliyor',
        tableName: 'batches',
        recordId: form.batch_id,
        newValues: {
          customer: form.customer,
          sold_kg: soldKg,
          status: 'sevk_bekliyor',
          remaining_kg: newRemaining,
        },
      })

      setOrderSuccess({
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
      loadPendingBatches()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ADIM 2: Barkod taraması — Depo C'ye fiziki transfer
  const handleScan = async (scannedCode) => {
    setScanning(false)
    setScanResult(null)

    // Sevk bekleyen partiler arasında ara
    const { data: batch, error: fetchError } = await supabase
      .from('batches')
      .select('*, sales_orders ( customer, sold_kg )')
      .eq('batch_no', scannedCode)
      .eq('status', 'sevk_bekliyor')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !batch) {
      // Başka durumda mı kontrol et
      const { data: anyBatch } = await supabase
        .from('batches')
        .select('status, location')
        .eq('batch_no', scannedCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (anyBatch?.location === 'depo_c') {
        setScanResult({ success: false, message: `❌ Bu parti zaten Depo C'de.` })
      } else if (anyBatch?.location === 'depo_b' && anyBatch?.status === 'transferred') {
        setScanResult({ success: false, message: `❌ Bu parti için henüz satış emri yok.` })
      } else {
        setScanResult({ success: false, message: `❌ Sevk bekleyen parti bulunamadı: ${scannedCode}` })
      }
      return
    }

    try {
      // Depo C'ye taşı
      const { error: updateError } = await supabase
        .from('batches')
        .update({
          location: 'depo_c',
          status: 'in_consumption',
        })
        .eq('id', batch.id)
      if (updateError) throw updateError

      // Hareket kaydı
      await supabase.from('movements').insert({
        batch_id: batch.id,
        action: 'transferred',
        from_location: 'depo_b',
        to_location: 'depo_c',
        quantity_kg: batch.remaining_kg,
        performed_by: user?.email || 'sistem',
        notes: `Fiziki transfer tamamlandi — Depo B -> Depo C`,
      })

      await log({
        userId: user.id,
        userEmail: user.email,
        action: 'Fiziki sevk tamamlandi — Depo B -> Depo C',
        tableName: 'batches',
        recordId: batch.id,
        newValues: { location: 'depo_c', status: 'in_consumption' },
      })

      setScanResult({
        success: true,
        message: `✅ Transfer tamamlandı! ${batch.batch_no} Depo C'ye taşındı.`,
        batch,
      })
      loadPendingBatches()

      if (navigator.vibrate) navigator.vibrate([100, 50, 100])
    } catch (err) {
      setScanResult({ success: false, message: `Hata: ${err.message}` })
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">🚚 Satış & Sevk</h2>

      {/* Tab menüsü */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab(TAB.ORDER)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors
            ${tab === TAB.ORDER
              ? 'bg-amber-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          📝 Satış Emri
        </button>
        <button
          onClick={() => setTab(TAB.PENDING)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors relative
            ${tab === TAB.PENDING
              ? 'bg-amber-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          🚚 Sevk Onayı
          {pendingBatches.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white
                             text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {pendingBatches.length}
            </span>
          )}
        </button>
      </div>

      {/* SATIŞ EMRİ FORMU */}
      {tab === TAB.ORDER && (
        <RoleGuard allowed={canEdit('warehouse')}>
          {orderSuccess && (
            <div className="bg-green-50 border border-green-300 rounded-xl p-4 mb-4">
              <p className="text-green-700 font-semibold">✅ Satış emri kaydedildi!</p>
              <p className="text-green-600 text-sm mt-1">
                <span className="font-mono font-bold">{orderSuccess.batch_no}</span>
                {' '}— {orderSuccess.sold_kg} kg → {orderSuccess.customer}
              </p>
              <p className="text-green-500 text-xs mt-1">
                Depo B'den düşüldü. Fiziki transfer için "Sevk Onayı" sekmesini kullanın.
              </p>
              <button
                onClick={() => setOrderSuccess(null)}
                className="mt-2 text-sm text-green-700 underline"
              >
                Yeni satış emri ekle
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <form onSubmit={handleSaveOrder} className="space-y-4">
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
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || batches.length === 0}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300
                           text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
              >
                {loading ? 'Kaydediliyor...' : '💾 Satış Emrini Kaydet'}
              </button>
            </form>
          </div>
        </RoleGuard>
      )}

      {/* SEVK ONAYI — Barkod ile Depo C'ye taşı */}
      {tab === TAB.PENDING && (
        <RoleGuard allowed={canEdit('warehouse')}>
          <div className="space-y-3">

            {/* Tarama sonucu */}
            {scanResult && (
              <div className={`rounded-xl p-4 text-center
                ${scanResult.success
                  ? 'bg-green-50 border border-green-300'
                  : 'bg-red-50 border border-red-300'}`}>
                <p className={`font-semibold ${scanResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {scanResult.message}
                </p>
                <button
                  onClick={() => setScanResult(null)}
                  className="mt-2 text-xs underline text-gray-500"
                >
                  Kapat
                </button>
              </div>
            )}

            {/* Barkod tarama butonu */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                📷 Sevk için barkod okut → Depo C'ye taşı
              </p>
              <HardwareScannerInput onScan={handleScan} />
              <button
                onClick={() => setScanning(true)}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold
                           py-4 rounded-xl flex items-center justify-center gap-2
                           active:scale-95 transition-all"
              >
                <span className="text-2xl">📷</span>
                <span>Kamerayı Aç</span>
              </button>
            </div>

            {/* Sevk bekleyen liste */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm font-medium text-amber-800 mb-2">
                ⏳ Sevk Bekleyen Partiler ({pendingBatches.length})
              </p>
              {pendingLoading && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent
                                  rounded-full animate-spin" />
                </div>
              )}
              {!pendingLoading && pendingBatches.length === 0 && (
                <p className="text-sm text-amber-600 text-center py-2">
                  Sevk bekleyen parti yok
                </p>
              )}
              {!pendingLoading && pendingBatches.map(batch => {
                const order = Array.isArray(batch.sales_orders)
                  ? batch.sales_orders[0]
                  : batch.sales_orders
                return (
                  <div key={batch.id}
                       className="bg-white rounded-lg p-3 mb-2 border border-amber-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-sm font-bold text-gray-800">
                          {batch.batch_no}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order?.customer || '—'} · {batch.remaining_kg} kg
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(batch.production_date)}
                        </p>
                      </div>
                      <span className="text-xs bg-amber-100 text-amber-700
                                       px-2 py-1 rounded-full font-medium">
                        Sevk Bekliyor
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {scanning && (
            <BarcodeScanner
              onScan={handleScan}
              onClose={() => setScanning(false)}
            />
          )}
        </RoleGuard>
      )}
    </div>
  )
}