import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { formatDate } from '../utils/batchUtils'

export default function BarcodeLabel({ batch, onClose }) {
  const previewRef = useRef(null)
  const printRef = useRef(null)

  // Her iki SVG'ye de barkod çiz
  useEffect(() => {
    if (!batch?.batch_no) return

    const opts = {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: false,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    }

    if (previewRef.current) {
      JsBarcode(previewRef.current, batch.batch_no, opts)
    }
    if (printRef.current) {
      JsBarcode(printRef.current, batch.batch_no, {
        ...opts,
        height: 40,   // Termal etiket için biraz küçük
        width: 1.8,
      })
    }
  }, [batch])

  if (!batch) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs">
        <h3 className="text-lg font-semibold text-center mb-4">🏷️ Barkod Etiketi</h3>

        {/* Ekran önizlemesi */}
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 mb-4
                        flex flex-col items-center bg-white">
          <svg ref={previewRef} className="w-full max-w-[180px]" />
          <p className="font-mono text-sm font-bold mt-1 tracking-wide">
            {batch.batch_no}
          </p>
          <p className="text-xs text-gray-500">{formatDate(batch.production_date)}</p>
          <p className="text-xs text-gray-500">{batch.quantity_kg} kg</p>
        </div>

        {/* Yazdırma alanı — @media print'te sadece bu görünür */}
        <div id="barcode-print">
          <svg ref={printRef} />
          <p className="batch-no-text">{batch.batch_no}</p>
          <p className="date-text">
            {formatDate(batch.production_date)} — {batch.quantity_kg} kg
          </p>
        </div>

        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700
                       hover:bg-gray-50 active:scale-95 transition-all"
          >
            Kapat
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-medium
                       hover:bg-amber-700 active:scale-95 transition-all"
          >
            🖨️ Yazdır
          </button>
        </div>
      </div>
    </div>
  )
}