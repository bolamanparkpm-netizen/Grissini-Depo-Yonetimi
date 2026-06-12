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
