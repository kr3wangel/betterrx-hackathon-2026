import { rmSync } from 'node:fs'

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`data/app.db${suffix}`, { force: true })
}
console.log('database reset — restart the server (or let tsx watch reload) to recreate it')
