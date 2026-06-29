"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Pencil, Trash2, BookOpen, FileText, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { SavedEvent, Profile, Draft } from "@/lib/types"

const STORAGE_KEY = "bigbaedocs_events"
const PROFILES_KEY = "bigbaedocs_profiles"
const DRAFTS_KEY = "bigbaedocs_drafts"

function loadProfiles(): Profile[] { try { const r = localStorage.getItem(PROFILES_KEY); return r ? JSON.parse(r) : [] } catch { return [] } }
function saveProfiles(ps: Profile[]) { localStorage.setItem(PROFILES_KEY, JSON.stringify(ps)) }
function loadDrafts(): Draft[] { try { const r = localStorage.getItem(DRAFTS_KEY); return r ? JSON.parse(r) : [] } catch { return [] } }

export default function Home() {
  const [events, setEvents] = useState<SavedEvent[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [pfGrade, setPfGrade] = useState("")
  const [pfClass, setPfClass] = useState("")
  const [pfNumber, setPfNumber] = useState("")
  const [pfName, setPfName] = useState("")

  useEffect(() => {
    try { const r = localStorage.getItem(STORAGE_KEY); if (r) setEvents(JSON.parse(r)) } catch {}
    setProfiles(loadProfiles())
    setDrafts(loadDrafts())
  }, [])

  function openAdd() { setEditingProfile(null); setPfGrade(""); setPfClass(""); setPfNumber(""); setPfName(""); setDialogOpen(true) }
  function openEdit(p: Profile) { setEditingProfile(p); setPfGrade(p.grade); setPfClass(p.class); setPfNumber(p.number); setPfName(p.studentName); setDialogOpen(true) }

  function handleSave() {
    if (!pfName) return
    if (editingProfile) {
      const updated = profiles.map((p) => p.id === editingProfile.id ? { ...p, grade: pfGrade, class: pfClass, number: pfNumber, studentName: pfName } : p)
      setProfiles(updated); saveProfiles(updated)
    } else {
      const p: Profile = { id: crypto.randomUUID(), grade: pfGrade, class: pfClass, number: pfNumber, studentName: pfName }
      const updated = [...profiles, p]
      setProfiles(updated); saveProfiles(updated)
    }
    setDialogOpen(false)
  }

  function deleteProfile(id: string) {
    saveProfiles(profiles.filter((p) => p.id !== id))
    setProfiles((prev) => prev.filter((p) => p.id !== id))
  }
  function deleteEvent(id: string) {
    const u = events.filter((e) => e.id !== id); setEvents(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
  }
  function deleteDraft(id: string) {
    const u = drafts.filter((d) => d.id !== id); setDrafts(u)
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(u))
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <FileText className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">BigBaeDocs</h1>
          <p className="text-muted-foreground text-sm">프로필 등록 후 AI가 내용을 다듬어드려요</p>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">인적사항 ({profiles.length})</h2>
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="w-4 h-4" /> 추가
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {profiles.map((p) => (
              <Card key={p.id} className="group relative hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">{p.studentName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{p.studentName}</div>
                      <div className="text-xs text-muted-foreground">{p.grade}-{p.class} {p.number}번</div>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(p)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => deleteProfile(p.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {profiles.length === 0 && (
              <div className="col-span-full text-center py-8 text-sm text-muted-foreground border rounded-lg border-dashed">
                등록된 인적사항이 없습니다. 추가 버튼을 눌러주세요.
              </div>
            )}
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">문서 작성</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/write?type=application">
              <Card className="hover:border-primary/30 transition-colors cursor-pointer group">
                <CardContent className="p-5">
                  <BookOpen className="w-5 h-5 text-primary mb-2" />
                  <div className="text-sm font-semibold">체험학습 신청서</div>
                  <div className="text-xs text-muted-foreground mt-1">학교 제출용 신청서 작성</div>
                  <div className="text-xs text-primary mt-3 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                    작성하기 <ChevronRight className="w-3 h-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/write?type=report">
              <Card className="hover:border-primary/30 transition-colors cursor-pointer group">
                <CardContent className="p-5">
                  <FileText className="w-5 h-5 text-primary mb-2" />
                  <div className="text-sm font-semibold">체험학습 보고서</div>
                  <div className="text-xs text-muted-foreground mt-1">체험 후 보고서 작성</div>
                  <div className="text-xs text-primary mt-3 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                    작성하기 <ChevronRight className="w-3 h-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {drafts.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">작성 중 ({drafts.length})</h2>
            <div className="space-y-2">
              {drafts.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()).map((draft) => (
                <Card key={draft.id} className="hover:border-primary/30 transition-colors group">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Link href={`/write?type=${draft.docType}&resume=${draft.id}`} className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{draft.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {draft.data.destination || "장소 미정"} · {draft.step + 1}/{draft.docType === "application" ? 7 : 6}단계
                      </div>
                    </Link>
                    <Badge variant="secondary">{draft.docType === "application" ? "신청서" : "보고서"}</Badge>
                    <Button variant="ghost" size="icon" className="w-8 h-8 opacity-0 group-hover:opacity-100" onClick={() => deleteDraft(draft.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {events.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">저장된 문서 ({events.length})</h2>
            <div className="space-y-2">
              {events.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()).map((evt) => (
                <Card key={evt.id} className="hover:border-primary/30 transition-colors group">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{evt.title}</div>
                      <div className="text-xs text-muted-foreground">{evt.studentName}{evt.date && ` · ${evt.date}`}</div>
                    </div>
                    <Badge variant="secondary">{evt.docType === "application" ? "신청서" : "보고서"}</Badge>
                    {evt.docType === "application" && (
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link href={`/write?type=report&from=${evt.id}`}>보고서 작성</Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="w-8 h-8 opacity-0 group-hover:opacity-100" onClick={() => deleteEvent(evt.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProfile ? "인적사항 수정" : "인적사항 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="학년" value={pfGrade} onChange={(e) => setPfGrade(e.target.value)} />
              <Input placeholder="반" value={pfClass} onChange={(e) => setPfClass(e.target.value)} />
              <Input placeholder="번호" value={pfNumber} onChange={(e) => setPfNumber(e.target.value)} />
            </div>
            <Input placeholder="학생 이름" value={pfName} onChange={(e) => setPfName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="text-center py-6 text-xs text-muted-foreground">HWP · PDF 자동 생성</footer>
    </div>
  )
}
