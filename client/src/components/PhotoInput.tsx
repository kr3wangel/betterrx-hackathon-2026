import { useState } from 'react'

export function PhotoInput({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-secondary px-4.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary-hover focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
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
