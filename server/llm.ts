import { anthropic } from './anthropic'

type ExtractOptions = {
  prompt: string
  schema: Record<string, unknown>
  system?: string
  model?: string | undefined
  maxTokens?: number
}

export async function extractJson<T>(opts: ExtractOptions): Promise<T> {
  const response = await anthropic().messages.create({
    model: opts.model ?? 'claude-opus-5',
    max_tokens: opts.maxTokens ?? 2048,
    ...(opts.system ? { system: opts.system } : {}),
    output_config: { format: { type: 'json_schema', schema: opts.schema } },
    messages: [{ role: 'user', content: opts.prompt }],
  })

  console.log(
    `[llm] in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason}`,
  )

  if (response.stop_reason === 'refusal') {
    throw new Error('model refused the request')
  }
  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error(`no text block in response (stop_reason: ${response.stop_reason})`)
  }
  return JSON.parse(block.text) as T
}
