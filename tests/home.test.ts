/**
 * 目录解析（离线）：状态文件必须跟随 `DSH_HOME`，新书目录必须跟随 settings 的
 * 输出目录。两者原先都写死 `~/.dsh`，导致桌面版与 CLI 版共用一份数据，并且
 * 清掉那一个目录就全灭。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultOutputDirFor } from '../src/bookshelf.ts'
import { dshHome, dshHomePath } from '../src/home.ts'

const KEYS = ['DSH_HOME', 'HOME', 'USERPROFILE'] as const

let dir: string
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nf-home-'))
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  process.env.HOME = dir
  process.env.USERPROFILE = dir
})

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('dshHome', () => {
  it('未设 DSH_HOME 时回退到 ~/.dsh', () => {
    expect(dshHome()).toBe(join(homedir(), '.dsh'))
  })

  it('DSH_HOME 优先于 ~/.dsh', () => {
    process.env.DSH_HOME = 'D:\\dsh-home'
    expect(dshHome()).toBe('D:\\dsh-home')
    expect(dshHomePath('state.json')).toBe(join('D:\\dsh-home', 'state.json'))
  })

  it('空/空白 DSH_HOME 视为未设置，不解析到当前工作目录', () => {
    process.env.DSH_HOME = '   '
    expect(dshHome()).toBe(join(homedir(), '.dsh'))
  })
})

describe('defaultOutputDirFor', () => {
  it('以 settings 配置的输出目录为父目录', () => {
    expect(defaultOutputDirFor('归墟玉主', 'H:\\novels')).toBe(join('H:\\novels', '归墟玉主'))
  })

  it('未配置输出目录时回退到 <DSH_HOME>/novels', () => {
    process.env.DSH_HOME = 'D:\\dsh-home'
    expect(defaultOutputDirFor('新书')).toBe(join('D:\\dsh-home', 'novels', '新书'))
  })

  it('空字符串输出目录同样回退', () => {
    process.env.DSH_HOME = 'D:\\dsh-home'
    expect(defaultOutputDirFor('新书', '')).toBe(join('D:\\dsh-home', 'novels', '新书'))
  })

  it('剔除文件名非法字符', () => {
    expect(defaultOutputDirFor('a/b:c*?"<>|d', 'H:\\novels')).toBe(join('H:\\novels', 'abcd'))
  })
})
