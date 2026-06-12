import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import BarcodeScanner from '../components/BarcodeScanner'
import { formatDate } from '../utils/batchUtils'
import HardwareScannerInput from '../components/HardwareScannerInput'

// Adım durumları
const STEP = {
  ORDER: 'order',       // Satış emri formu
  SCAN: 'scan',         // Barkod okuma
  DONE: 'done',         // Tamamlandı
}

export default function Sales() {
  const { user } = useAuth()
  const [step, setStep] = useState(STEP.ORDER)
  const [batches, setBatches] = useState([])  // Depo A'daki stoklar
  const [form, setForm] = useState({
    batch_id: '',
    sold_kg: '',
    customer: '',
    sale_date: new Date().toISOString().split('T')[0],
  })
  const [savedOrder, setSavedOrder] = useState(null)
  const [scanResult, setScanResult] = useState(null) // { success, message, batch }
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Depo A'daki stokları yükle
  useEffect(() => {
    supabase
      .from('batches')
      .select('*')
      .eq('location', 'depo_a')
      .eq('status', 'in_stock')
      .eq('quality_status', 'approved')   // ← Sadece kalite onaylı
      .order('production_date', { ascending: false })
      .then(({ data }) => setBatches(data || []))
  }, [])

  // Adım 1: Satış emrini kaydet
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

      // Hareket kaydı — satış emri oluşturuldu
      await supabase.from('movements').insert({
        batch_id: form.batch_id,
        action: 'sold',
        from_location: 'depo_a',
        to_location: 'depo_b',
        quantity_kg: soldKg,
        performed_by: user?.email || 'sistem',
        notes: `Müşteri: ${form.customer}`,
      })

      // Batch durumunu güncelle
      await supabase
        .from('batches')
        .update({
          status: 'sold',
          remaining_kg: parseFloat(selectedBatch.remaining_kg) - soldKg,
        })
        .eq('id', form.batch_id)

      setSavedOrder({ ...order, batch: selectedBatch })
      setStep(STEP.SCAN)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Adım 2: Barkod okunduğunda
  const handleScan = async (scannedCode) => {
    if (!savedOrder) return

    try {
      // Barkod eşleşme kontrolü
      if (scannedCode !== savedOrder.batch.batch_no) {
        setScanResult({
          success: false,
          message: `❌ Yanlış parti! Beklenen: ${savedOrder.batch.batch_no} — Okunan: ${scannedCode}`,
        })
        return
      }

      // Eğer barkod doğruysa süreci tamamla
      setScanResult({
        success: true,
        message: `✅ Doğrulama Başarılı! Parti eşleşti: ${scannedCode}`,
      })
      setStep(STEP.DONE)
    } catch (err) {
      setScanResult({
        success: false,
        message: `Hata oluştu: ${err.message}`,
      })
    }
  }

  // Süreci Sıfırla (Yeni Satış Emri)
  const handleReset = () => {
    setForm({
      batch_id: '',
      sold_kg: '',
      customer: '',
      sale_date: new Date().toISOString().split('T')[0],
    })
    setSavedOrder(null)
    setScanResult(null)
    setError('')
    setStep(STEP.ORDER)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🚀 Grissini Depo - Satış & Çıkış Yönetimi</h1>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4 font-medium">
          {error}
        </div>
      )}

      {/* ADIM 1: SATIŞ EMRİ FORMU */}
      {step === STEP.ORDER && (
        <form onSubmit={handleSaveOrder} className="bg-white p-6 rounded-lg shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">1. Adım: Satış Emri Oluştur</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Müşteri Adı</label>
            <input
              type="text"
              required
              className="w-full p-2 border rounded"
              placeholder="Örn: Bolaman Park"
              value={form.customer}
              onChange={e => setForm({ ...form, customer: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Satış Yapılacak Parti (Batch)</label>
            <select
              required
              className="w-full p-2 border rounded"
              value={form.batch_id}
              onChange={e => setForm({ ...form, batch_id: e.target.value })}
            >
              <option value="">Seçiniz...</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.batch_no} - {b.product_name} ({b.remaining_kg} kg kaldı)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Satış Miktarı (KG)</label>
            <input
              type="number"
              step="0.01"
              required
              className="w-full p-2 border rounded"
              placeholder="0.00"
              value={form.sold_kg}
              onChange={e => setForm({ ...form, sold_kg: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Satış Tarihi</label>
            <input
              type="date"
              required
              className="w-full p-2 border rounded"
              value={form.sale_date}
              onChange={e => setForm({ ...form, sale_date: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded font-medium transition"
          >
            {loading ? 'Kaydediliyor...' : 'Satış Emrini Onayla & Barkod Adımına Geç'}
          </button>
        </form>
      )}

      {/* ADIM 2: BARKOD TARAMA ADIMI */}
      {step === STEP.SCAN && savedOrder && (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <h3 className="font-semibold text-blue-800">📋 Onaylanan Satış Emri Detayları</h3>
            <p className="text-sm text-blue-700 mt-1">Müşteri: <strong>{savedOrder.customer}</strong></p>
            <p className="text-sm text-blue-700">Ürün: <strong>{savedOrder.batch.product_name}</strong></p>
            <p className="text-sm text-blue-700">Miktar: <strong>{savedOrder.sold_kg} KG</strong></p>
            <p className="text-sm text-blue-900 mt-2 font-medium">⚠️ Lütfen çıkış yapacağınız ürünün üzerindeki barkodu okutun.</p>
          </div>

          {/* Donanım Barkod Okuyucu Girişi (El Terminali / Kablolu Okuyucu için) */}
          <HardwareScannerInput onScan={handleScan} placeholder="El terminali ile okutun veya buraya tıklayıp taratın..." />

          {/* Kamera Barkod Okuyucu Alternatifi */}
          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 text-center mb-2">- VEYA KAMERAYI KULLANIN -</p>
            <BarcodeScanner onScan={handleScan} />
          </div>

          {scanResult && (
            <div className={`p-3 rounded text-center font-semibold ${scanResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {scanResult.message}
            </div>
          )}
        </div>
      )}

      {/* ADIM 3: TAMAMLANDI EKRANI */}
      {step === STEP.DONE && (
        <div className="bg-white p-8 rounded-lg shadow-md text-center space-y-4">
          <div className="text-5xl text-green-500">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800">İşlem Başarıyla Tamamlandı!</h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Ürün doğrulandı, Depo A stoku düşüldü ve satış transfer hareketi başarıyla kaydedildi.
          </p>
          <button
            onClick={handleReset}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-medium transition"
          >
            Yeni Satış İşlemi Başlat
          </button>
        </div>
      )}
    </div>
  )
}
