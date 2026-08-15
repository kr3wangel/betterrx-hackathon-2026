import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SignaturePad({ onCapture }: { onCapture: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const inked = useRef(false)
  const [signed, setSigned] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    canvas.width = canvas.offsetWidth * devicePixelRatio
    canvas.height = canvas.offsetHeight * devicePixelRatio
    ctx.scale(devicePixelRatio, devicePixelRatio)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function endStroke() {
    if (!drawing.current) return
    drawing.current = false
    if (!inked.current) return
    setSigned(true)
    onCapture(canvasRef.current!.toDataURL('image/png'))
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-md border border-slate-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drawing.current = true
          const ctx = canvasRef.current!.getContext('2d')!
          const { x, y } = pos(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = canvasRef.current!.getContext('2d')!
          const { x, y } = pos(e)
          ctx.lineTo(x, y)
          ctx.stroke()
          inked.current = true
        }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      <div className="flex items-center justify-between gap-2">
        {signed ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-success">
            <Check className="size-3.5" /> Signature captured
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Sign above with a finger or the mouse.</span>
        )}
        <Button
          variant="secondary"
          disabled={!signed}
          onClick={() => {
            const canvas = canvasRef.current!
            canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
            inked.current = false
            setSigned(false)
            onCapture(null)
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}
