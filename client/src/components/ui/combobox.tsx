import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

import { cn } from '@/lib/utils'

type ComboboxOption = {
  value: string
  label: string
  hint?: React.ReactNode
}

function Combobox({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  emptyMessage = 'No one matches',
  clearLabel = 'Clear selection',
  className,
}: {
  id?: string
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  clearLabel?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const listId = React.useId()

  const selected = options.find((o) => o.value === value)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  React.useEffect(() => {
    if (!open) return
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function openList() {
    if (open) return
    const index = filtered.findIndex((o) => o.value === value)
    setActiveIndex(index < 0 ? 0 : index)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  function commit(option: ComboboxOption) {
    onValueChange(option.value)
    close()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        openList()
        return
      }
      if (filtered.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + step + filtered.length) % filtered.length)
      return
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault()
      const option = filtered[activeIndex]
      if (option) commit(option)
      return
    }
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'Tab') close()
  }

  return (
    <div
      className={cn('relative', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close()
      }}
    >
      <div className="flex h-11 w-full items-center rounded-md border border-input bg-card pl-3 text-sm shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered.length > 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder={open && selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? '')}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onMouseDown={openList}
          onKeyDown={onKeyDown}
          className="h-11 min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {value !== '' && (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => {
              onValueChange('')
              close()
              inputRef.current?.focus()
            }}
            className="flex h-11 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
        <span className="flex h-11 w-9 items-center justify-center">
          <ChevronDown className="size-4 opacity-60" />
        </span>
      </div>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">{emptyMessage}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option)}
                className={cn(
                  'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-sm px-3 text-sm',
                  index === activeIndex && 'bg-accent text-accent-foreground',
                )}
              >
                <Check
                  className={cn('size-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')}
                />
                <span className="truncate">
                  {option.label}
                  {option.hint && <span className="ml-2 text-faint">{option.hint}</span>}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export { Combobox }
export type { ComboboxOption }
