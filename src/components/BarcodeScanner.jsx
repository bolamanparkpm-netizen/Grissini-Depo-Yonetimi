import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

/**
 * Kamera ile barkod okuma bileşeni
 * Android Chrome arka kamerayı otomatik seçer
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState('')

  useEffect(() => {
    let html5QrCode = null

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode

        // Kamera listesini al
        const cameras = await Html5Qrcode.getCameras()
        if (!cameras || cameras.length === 0) {
          setError('Kamera bulunamadı. İzinleri kontrol edin.')
          return
        }

        // Arka kamerayı tercih et (mobil için)
        const backCamera = cameras.find(cam =>
          cam.label.toLowerCase().includes('back') ||
          cam.label.toLowerCase().includes('rear') ||
          cam.label.toLowerCase().includes('arka') ||
          cam.label.includes('0')  // Android'de genelde arka kamera index 0
        ) || cameras[cameras.length - 1]  // Son kamera genelde arka

        await html5QrCode.start(
          backCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 100 },  // Barkod için yatay kutu
            aspectRatio: 1.5,
            formatsToSupport: [
              Html5Qrcode.BARCODE_FORMAT_CODE_128,  // Bizim formatımız
            ],
          },
          (decodedText) => {
            // Aynı barkodu art arda okuma — 1 saniye bekleme
            if (decodedText !== lastScan) {
              setLastScan(decodedText)
              // Titreşim geri bildirimi (destekleyen cihazlarda)
              if (navigator.vibrate) navigator.vibrate(100)
              onScan(decodedText)
            }
          },
          (scanError) => {
            // Aktif tarama hatası — normal durum, log'a basmıyoruz
          }
        )
        setScanning(true)
      } catch (err) {
        console.error('Kamera başlatma hatası:', err)
        if (err.name === 'NotAllowedError') {
          setError('Kamera izni reddedildi. Tarayıcı ayarlarından izin verin.')
        } else {
          setError(`Kamera hatası: ${err.message}`)
        }
      }
    }

    startScanner()

    // Temizlik — component unmount'ta kamerayı durdur
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Üst bar */}
      <div className="bg-black/80 text-white p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Barkod Tara</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Kamerayı barkodun üzerine tut
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 bg-white/20 rounded-full flex items-center
                     justify-center text-white text-xl hover:bg-white/30"
        >
          ✕
        </button>
      </div>

      {/* Kamera görüntüsü */}
      <div className="flex-1 flex items-center justify-center bg-black p-4">
        {error ? (
          <div className="text-center text-white">
            <div className="text-4xl mb-3">📷</div>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-white/20 rounded-lg text-sm"
            >
              Geri Dön
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <div id="qr-reader" className="rounded-xl overflow-hidden" />
            {scanning && (
              <p className="text-center text-white/60 text-xs mt-3">
                ● Taranıyor...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 
