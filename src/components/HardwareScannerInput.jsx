import { useRef, useEffect } from 'react'

/**
 * Fiziksel barkod okuyucu (USB/Bluetooth) için input.
 * Tarayıcı klavye gibi davranır: kodu yazar + Enter basar.
 * Sayfa açıldığında otomatik fokus alır, kullanıcı klavyeyle
 * yazmasa da tarayıcı "yazabilir".
 */
export default function HardwareScannerInput({ onScan }) {
  const inputRef = useRef(null)

  // Sayfa açıkken input her zaman fokuslu kalsın
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus()
    focusInput()
    // Kullanıcı ekranın başka yerine tıklarsa fokusu geri al
    document.addEventListener('click', focusInput)
    return () => document.removeEventListener('click', focusInput)
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const value = e.target.value.trim()
      if (value) {
        onScan(value)
        e.target.value = ''
      }
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      autoFocus
      onKeyDown={handleKeyDown}
      // Mobil klavyenin açılmasını engelle (sadece donanım okuyucu için)
      inputMode="none"
      className="absolute opacity-0 w-0 h-0"
      aria-hidden="true"
    />
  )
} 
