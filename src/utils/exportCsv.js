/**
 * Verilen veriyi CSV formatında indirir.
 * Excel'de doğrudan açılabilir (UTF-8 BOM ile Türkçe karakter sorunu önlenir)
 */
export function exportToCsv(filename, rows, columns) {
  // Başlık satırı
  const header = columns.map(c => c.label).join(';')

  // Veri satırları
  const lines = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? ''
      // Noktalı virgül veya yeni satır içeren değerleri tırnak içine al
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(';')
  )

  const csvContent = '\uFEFF' + [header, ...lines].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })

  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
} 
