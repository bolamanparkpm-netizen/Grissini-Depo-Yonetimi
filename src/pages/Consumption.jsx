import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import BarcodeScanner from '../components/BarcodeScanner'

export default function Consumption() {
  const { user } = useAuth()
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null) // { success, message, batch }
  const [loading, setLoading] = useState(false)

  const handleScan = async (scannedCode) => {
    setScanning(false)
    setLoading(true)
    setResult(null)

    try {
      // Barkod ile batch'i bul
      const { data: batch, error: fetchError } = await supabase
        .from('batches')
        .select('*')
        .eq('batch_no', scannedCode)
        .single()

      if (fetchError || !batch) {
        setResult({
          success: false,
          message: `❌ Parti bulunamadı: ${scannedCode}`,
        })
        return
      }

      // Depo B'de mi kontrol et
      if (batch.location !== 'depo_b') {
        const locationMsg = batch.location === 'consumed'
          ? 'Bu parti zaten tüketilmiş.'
          : `Bu parti Depo B'de değil (${batch.location === 'depo_a' ? 'Depo A' : batch.location}'da).`

        setResult({ success: false, message: `❌ ${locationMsg}` })
        return
      }

      // Batch'i tüketildi olarak işaretle
      const { error: updateError } = await supabase
        .from('batches')
        .update({
          status: 'consumed',
          location: 'consumed',
          remaining_kg: 0,
        })
        .eq('id', batch.id)

      if (updateError) throw updateError

      // Tüketim hareketi kaydet
      await supabase.from('movements').insert({
        batch_id: batch.id,
        action: 'consumed',
        from_location: 'depo_b',
        to_location: 'consumed',
        quantity_kg: batch.remaining_kg,
        performed_by: user?.email || 'sistem',
        notes: `Tüketim onayı — ${new Date().toLocaleString('tr-TR')}`,
      })

      setResult({
        success: true,
        message: `✅ Tüketim onaylandı!`,
        batch,
      })

      // Titreşim
      if (navigator.vibrate) navigator.vibrate([100, 50, 100])
    } catch (err) {
      setResult({ success: false, message: `Hata: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setScanning(false)
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-2">✅ Tüketim Kaydı</h2>
      <p className="text-sm text-gray-500 mb-6">
        Depo B'deki partiyi tüketildi olarak işaretlemek için barkodu okutun.
      </p>

      {/* Sonuç mesajı */}
      {result && (
        <div className={`rounded-xl p-5 mb-4 text-center
          ${result.success
            ? 'bg-green-50 border border-green-300'
            : 'bg-red-50 border border-red-300'
          }`}>
          <p className={`font-semibold text-lg mb-1
            ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.success ? '✅ Tüketildi' : '❌ Hata'}
          </p>
          <p className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
            {result.message}
          </p>
          {result.success && result.batch && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="font-mono text-sm text-green-800 font-bold">
                {result.batch.batch_no}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {result.batch.remaining_kg} kg tüketildi
              </p>
            </div>
          )}
          <button
            onClick={handleReset}
            className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm"
          >
            Tekrar Tara
          </button>
        </div>
      )}

      {/* Yükleniyor */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent
                          rounded-full animate-spin" />
        </div>
      )}

      {/* Tara butonu */}
      {!result && !loading && (
        <button
          onClick={() => setScanning(true)}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold
                     py-16 rounded-2xl flex flex-col items-center justify-center gap-3
                     active:scale-95 transition-all"
        >
          <span className="text-5xl">📷</span>
          <span className="text-base">Barkod Tara</span>
          <span className="text-gray-400 text-xs">Depo B → Tüketildi</span>
        </button>
      )}

      {/* Kamera ekranı */}
      {scanning && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  )
} 
