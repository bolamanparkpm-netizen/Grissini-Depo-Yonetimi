import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAudit } from '../hooks/useAudit'
import BarcodeScanner from '../components/BarcodeScanner'
import HardwareScannerInput from '../components/HardwareScannerInput'
import RoleGuard from '../components/RoleGuard'
import { formatDate } from '../utils/batchUtils'

const STEP = {
  ORDER: 'order',
  SCAN:  'scan',
  DONE:  'done',
}

export default function Sales() {
  const { user, canEdit } = useAuth()
  const { log } = useAudit()
  const [step, setStep] = useState(STEP.ORDER)
  const [batches, setBatches] = useState([])
  const [form, setForm] = useState({
    batch_id: '',
    sold_kg: '',
    customer: '',
    sale_date: new Date().toISOString().split('T')[0],
  })
  const [savedOrder, setSavedOrder] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

const loadBatches = () => {
  supabase
    .from('batches')
    .select('*')
    .eq('location', 'depo_b')        // ← Depo B
    .eq('status', 'transferred')      // ← Transfer edilmiş
    .eq('quality_status', 'approved') // ← Kalite onaylı
    .order('production_date', { ascending: false })
    .then(({ data }) => setBatches(data || []))
}

  useEffect(() => { loadBatches() }, [])

  const handleSaveOrder = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const soldKg = parseFloat(form.sold_kg)
      const selectedBatch = batches.find(b => b.id === form.batch_id)
      if (!selectedBatch) throw new Error('Batch seçilmedi')
      if (soldKg <= 0) throw new Error('Geçerli kg miktarı girin')
      if (soldKg > parseFloat(selectedBatch.remaining_kg)) {
        throw new Error(`Maksimum ${selectedBatch.remaining_kg} kg satılabilir`)
      }

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

	// Batch durumunu güncelle — sadece sold yap, location değişmesin
	await supabase
 	  .from('batches')
	  .update({ status: 'sold' })
	  .eq('id', form.batch_id)
      })

	// Satış emri oluşturuldu — sadece status güncelle, remaining_kg dokunma
	await supabase
 	 .from('batches')
 	 .update({
  	  status: 'sold',
 	   // remaining_kg'ı BURADA düşürme — transfer tamamlanınca düşür
 	 })
 	 .eq('id', form.batch_id)
	
      await log({
        userId: user.id,
        userEmail: user.email,
        action: 'Satış emri oluşturuldu',
        tableName: 'sales_orders',
        recordId: order.id,
        newValues: { batch_id: form.batch_id, sold_kg: soldKg, customer: form.customer },
      })

      setSavedOrder({ ...order, batch: selectedBatch })
      setStep(STEP.SCAN)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

const handleScan = async (scannedCode) => {
  if (!savedOrder) return
  try {
    if (scannedCode !== savedOrder.batch.batch_no) {
      setScanResult({
        success: false,
        message: `❌ Yanlış parti! Beklenen: ${savedOrder.batch.batch_no} — Okunan: ${scannedCode}`,
      })
      return
    }

    const batchId = savedOrder.batch_id || savedOrder.batch.id

    const { error: updateError } = await supabase
      .from('batches')
      .update({
        location: 'depo_c',           // ← Depo C'ye taşı
        status: 'in_consumption',
        remaining_kg: savedOrder.sold_kg,
      })
      .eq('id', batchId)
    if (updateError) throw updateError

    await supabase.from('movements').insert({
      batch_id: batchId,
      action: 'transferred',
      from_location: 'depo_b',
      to_location: 'depo_c',
      quantity_kg: savedOrder.sold_kg,
      performed_by: user?.email || 'sistem',
      notes: `Müşteri: ${savedOrder.customer} — Depo B → Depo C`,
    })

    await log({
      userId: user.id,
      userEmail: user.email,
      action: 'Satış transferi: Depo B → Depo C',
      tableName: 'batches',
      recordId: batchId,
      newValues: { location: 'depo_c', status: 'in_consumption' },
    })

    setScanResult({
      success: true,
      message: `✅ Transfer onaylandı! ${savedOrder.batch.batch_no} Depo C'ye taşındı.`,
    })
    setStep(STEP.DONE)
  } catch (err) {
    setScanResult({ success: false, message: `Hata: ${err.message}` })
  }
}

  const handleReset = () => {
    setStep(STEP.ORDER)
    setSavedOrder(null)
    setScanResult(null)
    setError('')
    setForm({
      batch_id: '',
      sold_kg: '',
      customer: '',
      sale_date: new Date().toISOString().split('T')[0],
    })
    loadBatches()
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-2">🚚 Satış & Sevk</h2>

      {/* Adım göstergesi */}
      <div className="flex items-center gap-2 mb-6">
        {['Satış Emri', 'Transfer', 'Tamamlandı'].map((label, i) => {
          const stepKeys = [STEP.ORDER, STEP.SCAN, STEP.DONE]
          const isActive = step === stepKeys[i]
          const isDone = stepKeys.indexOf(step) > i
          return (
            <div key={label} className="flex items-center gap-1 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center
                               text-xs font-bold flex-shrink-0
                               ${isActive ? 'bg-amber-600 text-white' :
                                 isDone   ? 'bg-green-500 text-white' :
                                            'bg-gray-200 text-gray-500'}`}>
                {isDone ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${isActive ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-gray-200 ml-1" />}
            </div>
          )
        })}
      </div>

      {/* ADIM 1 */}
      {step === STEP.ORDER && (
        <RoleGuard allowed={canEdit('warehouse')}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <form onSubmit={handleSaveOrder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Parti Seç (Depo A)
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
                    ⚠️ Satışa uygun stok bulunamadı (Kalite onayı bekleyen partiler olabilir)
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
                {loading ? 'Kaydediliyor...' : 'Satış Emrini Kaydet →'}
              </button>
            </form>
          </div>
        </RoleGuard>
      )}

      {/* ADIM 2 */}
      {step === STEP.SCAN && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-800">Bekleyen Transfer</p>
            <p className="font-mono text-base font-bold text-amber-900 mt-1">
              {savedOrder?.batch?.batch_no}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {savedOrder?.sold_kg} kg → {savedOrder?.customer}
            </p>
          </div>

          {scanResult && !scanResult.success && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-sm text-red-700">
              {scanResult.message}
            </div>
          )}

          <ScannerWrapper onScan={handleScan} active={step === STEP.SCAN} />
        </div>
      )}

      {/* ADIM 3 */}
      {step === STEP.DONE && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">✅</div>
	// ADIM 3 mesajını güncelle
	<h3 className="text-xl font-bold text-green-700 mb-2">Transfer Tamamlandı!</h3>
	<p className="text-gray-600 text-sm mb-6">
	  {savedOrder?.batch?.batch_no} Depo C — Tüketim Deposu'na taşındı.
	</p>
          <button
            onClick={handleReset}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold
                       py-3 px-6 rounded-xl transition-colors"
          >
            Yeni Satış Emri
          </button>
        </div>
      )}
    </div>
  )
}

function ScannerWrapper({ onScan, active }) {
  const [open, setOpen] = useState(false)
  if (!active) return null
  return (
    <>
      <HardwareScannerInput onScan={onScan} />
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-gray-300 text-gray-500
                   py-6 rounded-xl hover:border-amber-400 hover:text-amber-600
                   transition-colors text-sm"
      >
        📷 Kamerayı Aç
      </button>
      <p className="text-center text-xs text-gray-400 mt-2">
        veya fiziksel barkod okuyucu ile direkt tarayın
      </p>
      {open && (
        <BarcodeScanner
          onScan={(code) => { setOpen(false); onScan(code) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}