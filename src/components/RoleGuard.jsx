/**
 * Yetersiz yetkide içeriği gizler veya uyarı gösterir.
 * fallback: yetki yoksa gösterilecek içerik (opsiyonel)
 */
export default function RoleGuard({ allowed, fallback, children }) {
  if (!allowed) {
    return fallback ?? (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-gray-500 text-sm">Bu işlem için yetkiniz yok.</p>
      </div>
    )
  }
  return children
}