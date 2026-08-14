import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)

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
          setDirty(true)
        }}
        onPointerUp={() => {
          drawing.current = false
        }}
      />
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            const canvas = canvasRef.current!
            canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
            setDirty(false)
          }}
        >
          Clear
        </Button>
        <Button disabled={!dirty} onClick={() => onCapture(canvasRef.current!.toDataURL('image/png'))}>
          Capture signature
        </Button>
      </div>
    </div>
  )
}
