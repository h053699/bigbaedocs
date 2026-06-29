"use server"

import { mkdir, readFile, writeFile } from "fs/promises"
import { join } from "path"
import type { SharedApplicationDraft } from "@/lib/types"

const shareFile = join(process.cwd(), ".data", "shares.json")

async function readShares(): Promise<Record<string, SharedApplicationDraft>> {
  try {
    return JSON.parse(await readFile(shareFile, "utf-8"))
  } catch {
    return {}
  }
}

async function writeShares(shares: Record<string, SharedApplicationDraft>) {
  await mkdir(join(process.cwd(), ".data"), { recursive: true })
  await writeFile(shareFile, JSON.stringify(shares, null, 2), "utf-8")
}

export async function createApplicationShareAction(data: SharedApplicationDraft["data"]): Promise<{ id: string }> {
  const id = crypto.randomUUID()
  const shares = await readShares()
  shares[id] = { id, createdAt: new Date().toISOString(), data }
  await writeShares(shares)
  return { id }
}

export async function getApplicationShareAction(id: string): Promise<SharedApplicationDraft | null> {
  const shares = await readShares()
  return shares[id] ?? null
}
