import { useState } from 'react'
import { Card, Badge } from '../components/ui'
import { SignaturePad } from '../components/SignaturePad'
import { PhotoInput } from '../components/PhotoInput'

export default function PageThree() {
  const [signature, setSignature] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Capture demo</h1>
      <Card title="Signature">
        <SignaturePad onCapture={setSignature} />
        {signature && <Badge tone="green">captured</Badge>}
      </Card>
      <Card title="Photo">
        <PhotoInput onCapture={setPhoto} />
        {photo && <Badge tone="green">captured</Badge>}
      </Card>
    </div>
  )
}
