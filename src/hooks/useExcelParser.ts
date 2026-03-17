/**
 * Hook for Excel Parsing using Web Worker
 * Processes Excel files in a background thread
 */

import { useState, useCallback, useRef } from 'react'

interface ParseResult {
  headers: string[]
  rows: unknown[][]
  allRows: unknown[][]
  totalRows: number
}

export function useExcelParser() {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const parseFile = useCallback((file: File): Promise<ParseResult> => {
    return new Promise((resolve, reject) => {
      setParsing(true)
      setError(null)

      // Create worker if not exists
      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL('../workers/excel-parser.worker.ts', import.meta.url),
          { type: 'module' }
        )
      }

      const worker = workerRef.current

      // Handle worker messages
      const handleMessage = (e: MessageEvent) => {
        if (e.data.success) {
          resolve({
            headers: e.data.headers,
            rows: e.data.rows,
            allRows: e.data.allRows,
            totalRows: e.data.totalRows,
          })
        } else {
          const errorMsg = e.data.error || 'Excel dosyası işlenirken hata oluştu.'
          setError(errorMsg)
          reject(new Error(errorMsg))
        }
        setParsing(false)
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleError)
      }

      const handleError = (err: ErrorEvent) => {
        const errorMsg = err.message || 'Worker hatası oluştu.'
        setError(errorMsg)
        setParsing(false)
        reject(new Error(errorMsg))
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleError)
      }

      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleError)

      // Read file and send to worker
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          worker.postMessage({
            file: e.target.result,
            fileName: file.name,
          })
        } else {
          setError('Dosya okunamadı.')
          setParsing(false)
          reject(new Error('Dosya okunamadı.'))
        }
      }
      reader.onerror = () => {
        setError('Dosya okunamadı.')
        setParsing(false)
        reject(new Error('Dosya okunamadı.'))
      }
      reader.readAsArrayBuffer(file)
    })
  }, [])

  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
  }, [])

  return {
    parseFile,
    parsing,
    error,
    cleanup,
  }
}
