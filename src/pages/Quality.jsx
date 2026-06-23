import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAudit } from '../hooks/useAudit'
import { formatDate } from '../utils/batchUtils'
import RoleGuard from '../components/RoleGuard'

const QUALITY_LABELS = {
  pending:    { label: 'Analiz Bekliyor', color: 'bg-gray-100 text-gray-700',     icon: '⏳' },
  approved:   { label: 'Satışa Uygun',    color: 'bg-green-100 text-green-700',   icon: '✅' },
  rejected:   { label: 'Uygun Değil',     color: 'bg-red-100 text-red-700',       icon: '❌' },
  quarantine: { label: 'Karantina',       color: 'bg-orange-100 text-orange-700', icon: '🔬' },
}

export default function Quality() {
  const { user, canEdit } = useAuth()
  const { log } = useAudit()
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [noteDrafts, setNoteDrafts] = useState({})
  const [actingId, setActingId] = useState(null)

  const fetchBatches = async () => {
    setLoading(true)
    let query = supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false })
    if (filterStatus !== 'all') {
      query = query.eq('quality_status', filterStatus)
    }
    const { data, error } = await query
    if (error) {
      console.error('Kalite listesi yükleme hatası:', error)
    } else {
      setBatches(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchBatches()
  }, [filterStatus]) // eslint-disable-line react-hooks/exhaustive-deps

const handleSetStatus = async (batch, newStatus) => {
  setActingId(batch.id)
  try {
    const note = noteDrafts[batch.id] || ''

    // Lokasyon güncellemesi
    let locationUpdate = { quality_status: newStatus, quality_notes: note || null }

    if (newStatus === 'approved') {
      // Kalite onayı → Depo B'ye taşı
      locationUpdate = {
        ...locationUpdate,
        location: 'depo_b',
        status: 'transferred',
      }
    } else if (newStatus === 'quarantine') {
      // Karantina → Karantina deposuna taşı
      locationUpdate = {
        ...locationUpdate,
        location: 'depo_karantina',
        status: 'quarantine',
      }
    } else if (newStatus === 'rejected') {
      // Red → Karantina deposuna taşı (fiziksel olarak ayrılsın)
      locationUpdate = {
        ...locationUpdate,
        location: 'depo_karantina',
        status: 'rejected',
      }
    }

    const { error: updateError } = await supabase
      .from('batches')
      .update(locationUpdate)
      .eq('id', batch.id)
    if (updateError) throw updateError

    const actionMap = {
      approved:   'quality_approved',
      rejected:   'quality_rejected',
      quarantine: 'quality_quarantine',
    }

    const toLocation =
      newStatus === 'approved'   ? 'depo_b' :
      newStatus === 'quarantine' ? 'depo_karantina' :
      newStatus === 'rejected'   ? 'depo_karantina' : batch.location

    await supabase.from('movements').insert({
      batch_id: batch.id,
      action: actionMap[newStatus],
      from_location: batch.location,
      to_location: toLocation,
      quantity_kg: batch.remaining_kg,
      performed_by: user?.email || 'sistem',
      notes: note || (
        newStatus === 'approved'   ? 'Kalite onayı — Depo B\'ye transfer' :
        newStatus === 'quarantine' ? 'Karantinaya alındı' :
                                     'Reddedildi — Karantina deposuna alındı'
      ),
    })

    await log({
      userId: user.id,
      userEmail: user.email,
      action: `Kalite: ${newStatus} — ${batch.location} → ${toLocation}`,
      tableName: 'batches',
      recordId: batch.id,
      oldValues: { quality_status: batch.quality_status, location: batch.location },
      newValues: locationUpdate,
    })

    fetchBatches()
  } catch (err) {
    alert('Hata: ' + err.message)
  } finally {
    setActingId(null)
  }
}