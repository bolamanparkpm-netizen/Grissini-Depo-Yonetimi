import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAudit } from '../hooks/useAudit'
import BarcodeScanner from '../components/BarcodeScanner'
import HardwareScannerInput from '../components/HardwareScannerInput'
import RoleGuard from '../components/RoleGuard'

export default function Consumption() {
  const { user, canEdit } = useAuth()
  const { log } = useAudit()
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

const handleScan = async (scannedCode) => {
  setScanning(false)
  setLoading(true)
  setResult(null)

  try {
    const { data: batch, error: fetchError } = await supabase
      .from('batches')
      .select('*')
      .eq('batch_no', scannedCode)
      .eq('location', 'depo_c')
      .single()

    if (fetchError || !batch) {
      // Nerede olduğunu bul
      const { data: anyBatch } = await supabase
        .from('batches')
        .select('location, status')
        .eq('batch_no', scannedCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!anyBatch) {
        setResult({ success: false, message: `❌ Parti bulunamadı: ${scannedCode}` })
      } else if (anyBatch.status === 'consumed') {
        setResult({ success: false, message: '❌ Bu parti zaten tüketilmiş.' })
      } else if (anyBatch.location === 'depo_a') {
        setResult({ success: false, message: '❌ Bu parti Depo A\'da — kalite onayı bekleniyor.' })
      } else if (anyBatch.location === 'depo_b') {
        setResult({ success: false, message: '❌ Bu parti Depo B\'de — önce satış transferi yapılmalı.' })
      } else {
        setResult({ success: false, message: `❌ Bu parti tüketim deposunda değil.` })
      }
      return
    }

    // Depo C'den tüket
    const { error: updateError } = await supabase
      .from('batches')
      .update({
        status: 'consumed',
        location: 'consumed',
        remaining_kg: 0,
      })
      .eq('id', batch.id)
    if (updateError) throw updateError

    await supabase.from('movements').insert({
      batch_id: batch.id,
      action: 'consumed',
      from_location: 'depo_c',
      to_location: 'consumed',
      quantity_kg: batch.remaining_kg,
      performed_by: user?.email || 'sistem',
      notes: `Tüketim tamamlandı — ${new Date().toLocaleString('tr-TR')}`,
    })

    await log({
      userId: user.id,
      userEmail: user.email,
      action: 'Tüketim tamamlandı — Depo C → Consumed',
      tableName: 'batches',
      recordId: batch.id,
      oldValues: { location: 'depo_c', remaining_kg: batch.remaining_kg },
      newValues: { location: 'consumed', status: 'consumed', remaining_kg: 0 },
    })

    setResult({
      success: true,
      type: 'consumed',
      message: `✅ Tüketim tamamlandı! ${batch.batch_no} stoktan düşüldü.`,
      batch,
    })
    if (navigator.vibrate) navigator.vibrate([100, 50, 100])

  } catch (err) {
    setResult({ success: false, message: `Hata: ${err.message}` })
  } finally {
    setLoading(false)
  }
}

  const handleReset = () => { setResult(null); setScanning(false) }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-2">🍽️ Tüketim Kaydı</h2>
      <p className="text-sm text-gray-500 mb-4">
        Depo B → barkod okut → Depo C'ye al.<br />
        Depo C → barkod okut → Tüketimi tamamla.
      </p>

      {/* Akış göstergesi */}
	<div className="flex items-center justify-center gap-2 mb-6 text-xs text-gray-500">
	  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-medium">
	    🏪 Depo B
	  </span>
	  <span>→</span>
	  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-lg font-medium">
	    🍽️ Depo C
	  </span>
	  <span>→</span>
	  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">
	    ✅ Tüketildi
	  </span>
	</div>

      {/* Sonuç mesajı */}
      {result && (
        <div className={`rounded-xl p-5 mb-4 text-center
          ${result.success ? 'bg-green-50 border border-green-300'
                           : 'bg-red-50 border border-red-300'}`}>
          <p className={`font-semibold text-lg mb-1
            ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.success
              ? result.type === 'depo_c' ? '🍽️ Depo C\'ye Alındı' : '✅ Tüketim Tamamlandı'
              : '❌ Hata'}
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
                {result.batch.remaining_kg} kg
                {result.type === 'depo_c'
                  ? ' → Depo C\'ye taşındı'
                  : ' → Stoktan düşüldü'}
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

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent
                          rounded-full animate-spin" />
        </div>
      )}

      {!result && !loading && (
        <RoleGuard allowed={canEdit('warehouse')}>
          <HardwareScannerInput onScan={handleScan} />
          <button
            onClick={() => setScanning(true)}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold
                       py-16 rounded-2xl flex flex-col items-center justify-center gap-3
                       active:scale-95 transition-all"
          >
            <span className="text-5xl">📷</span>
            <span className="text-base">Barkod Tara</span>
            <span className="text-gray-400 text-xs">
              Depo B → Depo C → Tüketildi
            </span>
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            veya fiziksel barkod okuyucu ile direkt tarayın
          </p>
        </RoleGuard>
      )}

      {scanning && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  )
}