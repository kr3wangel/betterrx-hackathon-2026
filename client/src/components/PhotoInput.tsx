import { useState } from 'react'

export function PhotoInput({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
        Take photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = reader.result as string
              setPreview(dataUrl)
              onCapture(dataUrl)
            }
            reader.readAsDataURL(file)
          }}
        />
      </label>
      {preview && (
        <img
          src={preview}
          alt="The equipment you just photographed"
          className="max-h-48 rounded-md border border-border"
        />
      )}
    </div>
  )
}
