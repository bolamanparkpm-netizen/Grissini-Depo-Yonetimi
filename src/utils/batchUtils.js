/**
 * İstemci tarafında batch numarası üretir
 * Sunucu tarafı generate_batch_no() fonksiyonu tercih edilir
 * ama fallback olarak burada da tutuyoruz
 */
export function formatBatchNo(date, count) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const seq = String(count).padStart(3, '0')
  return `GRS-${y}${m}${day}-${seq}`
}

/** Lokasyon etiketlerini Türkçe yap */
export function locationLabel(loc) {
  const map = {
    depo_a: '🏭 Depo A',
    depo_b: '🏪 Depo B',
    consumed: '✅ Tüketildi',
  }
  return map[loc] || loc
}

/** Durum badge rengi (Tailwind sınıfları) */
export function statusColor(status) {
  const map = {
    in_stock:    'bg-green-100 text-green-800',
    sold:        'bg-blue-100 text-blue-800',
    transferred: 'bg-yellow-100 text-yellow-800',
    consumed:    'bg-gray-100 text-gray-600',
  }
  return map[status] || 'bg-gray-100 text-gray-600'
}

/** Tarih formatla → "11 Haz 2024" */
export function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
} 
