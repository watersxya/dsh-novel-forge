// DSH web restart (reliable): parse netstat, kill 3080, relaunch detached.
import { spawn, execSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { appendFileSync } from 'node:fs'

const LOG = 'D:\\ryan work\\harness\\plugins\\novel-forge\\scripts\\restart-dsh-web.log'
const BIN = 'C:\\Users\\Ryan\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'
const CWD = 'D:\\ryan work\\harness\\plugins\\novel-forge'

function log(s) { try { appendFileSync(LOG, new Date().toISOString() + ' ' + s + '\n') } catch {} }
function listenerPid() {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8' })
    for (const line of out.split('\n')) {
      if (/127\.0\.0\.1:3080\s/.test(line) && /LISTENING/i.test(line)) {
        const parts = line.trim().split(/\s+/)
        return parts[parts.length - 1]
      }
    }
  } catch {}
  return null
}

async function main() {
  log('start')
  await sleep(5000)
  const pid = listenerPid()
  log('pid=' + JSON.stringify(pid))
  if (pid) {
    try { execSync('taskkill /f /pid ' + pid + ' >nul 2>&1'); log('killed ' + pid) } catch (e) { log('kill err ' + (e && e.message)) }
  }
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    const now = listenerPid()
    if (now === null || now !== pid) break
  }
  log('port free, spawning')
  const child = spawn('node', [BIN, 'web', '--no-open'], { cwd: CWD, detached: true, stdio: 'ignore' })
  child.unref()
  log('spawned')
}
main()
