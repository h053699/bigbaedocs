"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft, ArrowRight, Sparkles, ImageIcon, FileDown, FileText, Check,
  MapPin, Calendar, User, Target, FileEdit, Shield, ChevronDown, Plus, X, AlertCircle, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { chatAction } from "@/app/actions/chat"
import { searchPlace } from "@/app/actions/kakao"
import { generateHwpAction, generatePdfAction } from "@/app/actions/generate"
import { createApplicationShareAction, getApplicationShareAction } from "@/app/actions/share"
import { MODELS } from "@/lib/types"
import type { DocType, ImageAttachment, ApplicationData, ReportData, ModelId, Profile, ContentLength, WritingStyle, TravelType, Draft, SavedEvent } from "@/lib/types"

const EVENTS_KEY = "bigbaedocs_events"
const PROFILES_KEY = "bigbaedocs_profiles"
const DRAFTS_KEY = "bigbaedocs_drafts"
function loadProfiles(): Profile[] { try { const r = localStorage.getItem(PROFILES_KEY); return r ? JSON.parse(r) : [] } catch { return [] } }
function saveProfiles(ps: Profile[]) { localStorage.setItem(PROFILES_KEY, JSON.stringify(ps)) }
function saveDrafts(drafts: Draft[]) { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)) }
function loadSavedEvents(): SavedEvent[] { try { const r = localStorage.getItem(EVENTS_KEY); return r ? JSON.parse(r) : [] } catch { return [] } }
function saveSavedEvents(events: SavedEvent[]) { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)) }

const STEPS_APP = [
  { key: "profile", icon: User, title: "인적사항", desc: "학생 프로필을 선택하세요 (여러 명 가능)" },
  { key: "destination", icon: MapPin, title: "장소", desc: "어디로 가는지 알려주세요" },
  { key: "date", icon: Calendar, title: "기간", desc: "언제 가는지 알려주세요" },
  { key: "purpose", icon: Target, title: "목적", desc: "무엇을 하러 가나요?" },
  { key: "plan", icon: FileEdit, title: "계획", desc: "세부 일정과 활동 계획" },
  { key: "guardian", icon: Shield, title: "보호자", desc: "보호자 정보를 입력하세요" },
  { key: "generate", icon: FileDown, title: "생성", desc: "문서를 다운로드하세요" },
]

const STEPS_REPORT = [
  { key: "profile", icon: User, title: "인적사항", desc: "학생 프로필을 선택하세요 (여러 명 가능)" },
  { key: "destination", icon: MapPin, title: "장소", desc: "어디로 다녀왔나요?" },
  { key: "date", icon: Calendar, title: "기간", desc: "언제 다녀왔나요?" },
  { key: "purpose", icon: Target, title: "목적", desc: "무엇을 하러 갔나요?" },
  { key: "content", icon: FileEdit, title: "내용", desc: "무엇을 했는지 적어주세요" },
  { key: "learnings", icon: Sparkles, title: "느낀점", desc: "배운 점을 적어주세요" },
  { key: "generate", icon: FileDown, title: "생성", desc: "문서를 다운로드하세요" },
]

function ChatContent() {
  const router = useRouter()
  const params = useSearchParams()
  const docType = (params.get("type") as DocType) ?? "application"
  const steps = docType === "application" ? STEPS_APP : STEPS_REPORT
  const [step, setStep] = useState(0)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set())
  const [model, setModel] = useState<ModelId>("gemini-3-flash-agent")

  const [destination, setDestination] = useState("")
  const [destinationFull, setDestinationFull] = useState("")
  const [destinationResults, setDestinationResults] = useState<string[]>([])
  const [destinationRaw, setDestinationRaw] = useState("")
  const [searchMode, setSearchMode] = useState<"osm" | "ai">("osm")

  function selectDestination(result: string) {
    let name: string, address: string
    if (result.includes(" — ")) {
      [name, address] = [result.split(" — ")[0].trim(), result.split(" — ").slice(1).join(", ")]
    } else {
      const parts = result.split(",")
      name = parts[0].trim()
      address = parts.slice(1).map((s) => s.trim()).filter(Boolean).join(", ")
    }
    setDestination(name)
    setDestinationFull(address)
    setDestinationResults([])
  }

  function formatDateWithDay(dateStr: string) {
    if (!dateStr) return ""
    const d = new Date(dateStr + "T00:00:00")
    const days = ["일", "월", "화", "수", "목", "금", "토"]
    return `${dateStr} (${days[d.getDay()]})`
  }
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [dateRaw, setDateRaw] = useState("")
  const [purpose, setPurpose] = useState("")
  const [plan, setPlan] = useState("")
  const [content, setContent] = useState("")
  const [learnings, setLearnings] = useState("")
  const [contentLength, setContentLength] = useState<ContentLength>("short")
  const [writingStyle, setWritingStyle] = useState<WritingStyle>("plain")
  const [travelType, setTravelType] = useState<TravelType>("domestic")
  const [guardianName, setGuardianName] = useState("")
  const [guardianRelation, setGuardianRelation] = useState("")
  const [guardianPhone, setGuardianPhone] = useState("")
  const [images, setImages] = useState<ImageAttachment[]>([])

  const [polishing, setPolishing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingDestination, setEditingDestination] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [draftId] = useState(() => params.get("resume") ?? crypto.randomUUID())

  useEffect(() => {
    const timeout = setTimeout(() => {
      const draft = {
        id: draftId,
        docType,
        title: docType === "application" ? "체험학습 신청서" : "체험학습 보고서",
        step,
        lastModified: new Date().toISOString(),
        data: {
          selectedProfileIds: Array.from(selectedProfileIds),
          destination, destinationFull, startDate, endDate, purpose,
          plan, content, learnings, contentLength, writingStyle,
          guardianName, guardianRelation, guardianPhone,
          travelType,
        },
      }
      try {
        const raw = localStorage.getItem(DRAFTS_KEY)
        const drafts: Draft[] = raw ? JSON.parse(raw) : []
        const idx = drafts.findIndex((d) => d.id === draftId)
        if (idx >= 0) drafts[idx] = draft
        else drafts.push(draft)
        saveDrafts(drafts)
      } catch {}
    }, 500)
    return () => clearTimeout(timeout)
  }, [selectedProfileIds, destination, destinationFull, startDate, endDate, purpose, plan, content, learnings, contentLength, writingStyle, guardianName, guardianRelation, guardianPhone, travelType, step, draftId, docType])
  const [pfGrade, setPfGrade] = useState("")
  const [pfClass, setPfClass] = useState("")
  const [pfNumber, setPfNumber] = useState("")
  const [pfName, setPfName] = useState("")

  useEffect(() => {
    setProfiles(loadProfiles())

    const resumeId = params.get("resume")
    if (resumeId) {
      try {
        const raw = localStorage.getItem(DRAFTS_KEY)
        const drafts: Draft[] = raw ? JSON.parse(raw) : []
        const draft = drafts.find((d) => d.id === resumeId)
        if (draft?.data) {
          const d = draft.data
          if (d.selectedProfileIds) setSelectedProfileIds(new Set(d.selectedProfileIds))
          if (d.destination) setDestination(d.destination)
          if (d.destinationFull) setDestinationFull(d.destinationFull)
          if (d.startDate) setStartDate(d.startDate)
          if (d.endDate) setEndDate(d.endDate)
          if (d.purpose) setPurpose(d.purpose)
          if (d.plan) setPlan(d.plan)
          if (d.content) setContent(d.content)
          if (d.learnings) setLearnings(d.learnings)
          if (d.contentLength) setContentLength(d.contentLength)
          if (d.guardianName) setGuardianName(d.guardianName)
          if (d.guardianRelation) setGuardianRelation(d.guardianRelation)
          if (d.guardianPhone) setGuardianPhone(d.guardianPhone)
          if (d.travelType) setTravelType(d.travelType)
          if (draft.step != null) setStep(draft.step)
        }
      } catch {}
    } else if (docType === "report") {
      const sourceId = params.get("from")
      if (sourceId) {
        try {
          const event = loadSavedEvents().find((e) => e.id === sourceId && e.docType === "application")
          const d = event?.extractedData as Partial<ApplicationData> | undefined
          if (event && d) {
            const matched = loadProfiles().find((p) => p.studentName === event.studentName && p.grade === d.grade && p.class === d.class && p.number === d.number)
            if (matched) setSelectedProfileIds(new Set([matched.id]))
            if (d.destination) setDestination(d.destination)
            if (d.destinationFull) setDestinationFull(d.destinationFull)
            if (d.startDate) setStartDate(d.startDate)
            if (d.endDate) setEndDate(d.endDate)
            if (d.purpose) setPurpose(d.purpose)
            if (d.plan) setContent(d.plan)
            if (d.travelType) setTravelType(d.travelType)
            setStep(4)
          }
        } catch {}
      }
    } else if (docType === "application") {
      const shareId = params.get("share")
      if (shareId) {
        getApplicationShareAction(shareId).then((share) => {
          if (!share) return setError("공유된 신청서를 찾을 수 없습니다")
          const d = share.data
          setDestination(d.destination)
          setDestinationFull(d.destinationFull)
          setStartDate(d.startDate)
          setEndDate(d.endDate)
          setPurpose(d.purpose)
          setPlan(d.plan)
          setContentLength(d.contentLength)
          setWritingStyle(d.writingStyle)
          setTravelType(d.travelType)
          setStep(1)
        }).catch(() => setError("공유 신청서를 불러오지 못했습니다"))
      }
    }
  }, [])

  async function shareApplicationDraft() {
    if (docType !== "application") return
    setError(null)
    try {
      const { id } = await createApplicationShareAction({
        destination,
        destinationFull,
        startDate,
        endDate,
        purpose,
        plan,
        content,
        learnings,
        contentLength,
        writingStyle,
        travelType,
      })
      const url = `${window.location.origin}/write?type=application&share=${id}`
      setShareUrl(url)
      await navigator.clipboard?.writeText(url)
    } catch (e) {
      setError(`공유 링크 생성 실패: ${e instanceof Error ? e.message : "오류"}`)
    }
  }

  const selectedProfiles = profiles.filter((p) => selectedProfileIds.has(p.id))

  function toggleProfile(id: string) {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openAddProfile() { setEditingProfile(null); setPfGrade(""); setPfClass(""); setPfNumber(""); setPfName(""); setDialogOpen(true) }
  function openEditProfile(p: Profile) { setEditingProfile(p); setPfGrade(p.grade); setPfClass(p.class); setPfNumber(p.number); setPfName(p.studentName); setDialogOpen(true) }
  function handleSaveProfile() {
    if (!pfName) return
    if (editingProfile) {
      const u = profiles.map((p) => p.id === editingProfile.id ? { ...p, grade: pfGrade, class: pfClass, number: pfNumber, studentName: pfName } : p)
      setProfiles(u); saveProfiles(u)
    } else {
      const p: Profile = { id: crypto.randomUUID(), grade: pfGrade, class: pfClass, number: pfNumber, studentName: pfName }
      const u = [...profiles, p]; setProfiles(u); saveProfiles(u)
      setSelectedProfileIds((prev) => { const n = new Set(prev); n.add(p.id); return n })
    }
    setDialogOpen(false)
  }
  function deleteProfile(id: string) {
    const u = profiles.filter((p) => p.id !== id); setProfiles(u); saveProfiles(u)
    setSelectedProfileIds((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  async function searchDestination() {
    if (!destinationRaw) return; setPolishing("destination"); setDestinationResults([]); setError(null)
    try {
      if (searchMode === "osm") {
        const { results, error: err } = await searchPlace(destinationRaw, travelType === "international")
        if (err) { setError(err); setPolishing(null); return }
        setDestinationResults(results)
        if (results.length === 0) setError("검색 결과가 없습니다")
      } else {
        const result = await chatAction(docType, [{
          role: "user",
          content: `대한민국에서 다음 키워드에 해당하는 장소의 정확한 명칭과 주소를 한 줄씩 최대 3개 찾아줘. 한국에 없는 장소면 한국에 있는 비슷한 장소를 찾아줘. 각 줄은 "장소명 — 주소" 형식으로. 인사말, 설명, 추가 질문 절대 금지:\n"${destinationRaw}"`,
        }], [], model)
        const lines = result.message.split("\n").map((l: string) => l.trim()).filter(Boolean).slice(0, 3)
        setDestinationResults(lines)
        if (lines.length === 0) setError("AI 검색 결과가 없습니다")
      }
    } catch (e) {
      setError(`검색 중 오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`)
    }
    setPolishing(null)
  }

  async function aiParseDate() {
    if (!dateRaw) return; setPolishing("date"); setError(null)
    try {
      const today = new Date().toISOString().split("T")[0]
      const result = await chatAction(docType, [{
        role: "user",
        content: `오늘은 ${today}입니다.\n다음 자연어 날짜를 아래 JSON만 정확히 출력해. 다른 말 절대 금지.\n{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}\n\n"${dateRaw}"`,
      }], [], model)
      try {
        const parsed = JSON.parse(result.message)
        if (parsed.start) setStartDate(parsed.start)
        if (parsed.end) setEndDate(parsed.end)
      } catch {
        const dates = result.message.match(/\d{4}-\d{2}-\d{2}/g)
        if (dates && dates.length >= 1) {
          setStartDate(dates[0])
          setEndDate(dates[1] ?? dates[0])
        } else {
          setError("날짜를 인식하지 못했어요. 직접 선택해주세요")
        }
      }
    } catch (e) {
      setError(`날짜 변환 실패: ${e instanceof Error ? e.message : "오류"}`)
    }
    setPolishing(null)
  }

  async function aiPolish(target: string) {
    setPolishing(target); setError(null)
    const raw = target === "purpose" ? purpose : target === "plan" ? plan : target === "content" ? content : learnings
    const len = contentLength === "short" ? "2~3줄로 간결하게" : "상세하게"
    const style = writingStyle === "plain" ? "~했다, ~했다 식의 간결한 음슴체로" : "~했습니다 식의 자연스러운 존댓말로"
    const prompt = target === "plan"
      ? `체험학습 계획을 ${len} ${style} 미래형(~할 예정이다, ~할 계획이다)으로 써줘. 일자/기간은 절대 포함하지 말고 활동 내용만. AI 티 나는 말투 절대 금지. 인사말, 설명 절대 금지. 다듬은 텍스트만 출력:\n장소: ${destination}\n목적: ${purpose}\n계획: ${raw}`
      : target === "content"
      ? `체험학습 내용을 ${len} ${style} 과거형(~했다)으로 써줘. AI 티 나는 말투 절대 금지. 인사말, 설명 절대 금지. 다듬은 텍스트만 출력:\n장소: ${destination}\n내용: ${raw}`
      : target === "learnings"
      ? `배운 점을 ${len} ${style} 과거형(~했다, ~느꼈다)으로 써줘. AI 티 나는 말투 절대 금지. 인사말, 설명 절대 금지. 다듬은 텍스트만 출력:\n내용: ${content}\n느낀점: ${raw}`
      : `체험학습 목적을 한 줄로 자연스럽게 다듬어줘. AI 티 안 나게. 인사말, 설명 절대 금지. 다듬은 텍스트만 출력:\n${raw}`
    try {
      const result = await chatAction(docType, [{ role: "user", content: prompt }], [], model)
      const polished = result.message.trim()
      if (target === "purpose") setPurpose(polished)
      else if (target === "plan") setPlan(polished)
      else if (target === "content") setContent(polished)
      else setLearnings(polished)
    } catch (e) {
      setError(`AI 다듬기 실패: ${e instanceof Error ? e.message : "오류"}`)
    }
    setPolishing(null)
  }

  async function handleGenerate(format: "hwp" | "pdf") {
    if (selectedProfiles.length === 0) return; setGenerating(true); setError(null)
    const submittedDate = new Date().toISOString().split("T")[0]
    const generatedEvents: SavedEvent[] = []
    try {
      for (const p of selectedProfiles) {
        let data: ApplicationData | ReportData
        if (docType === "application") {
          data = { grade: p.grade, class: p.class, number: p.number, studentName: p.studentName, guardianName, guardianRelation, guardianPhone, startDate, endDate, destination, destinationFull, purpose, plan, submittedDate, travelType }
        } else {
          data = { studentName: p.studentName, grade: p.grade, class: p.class, number: p.number, title: destination ? `${destination} 체험학습 보고서` : "체험학습 보고서", startDate, endDate, destination, destinationFull, purpose, content, learnings, submittedDate, travelType }
        }
        const dataUri = format === "hwp"
          ? await generateHwpAction(docType, data as ApplicationData & ReportData, images)
          : await generatePdfAction(docType, data as ApplicationData & ReportData, images)
        const a = document.createElement("a"); a.href = dataUri
        const ext = format === "hwp" ? "hwpx" : "pdf"
        a.download = `${docType === "application" ? "체험학습신청서" : "체험학습보고서"}_${p.studentName}.${ext}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        generatedEvents.push({
          id: `${draftId}-${docType}-${p.id}`,
          docType,
          title: docType === "application" ? `${destination || "체험학습"} 신청서` : `${destination || "체험학습"} 보고서`,
          studentName: p.studentName,
          date: startDate,
          lastModified: new Date().toISOString(),
          extractedData: data,
          messages: [],
          images: docType === "report" ? images : [],
        })
        await new Promise((r) => setTimeout(r, 300))
      }
      const saved = loadSavedEvents()
      const merged = [...generatedEvents, ...saved.filter((e) => !generatedEvents.some((g) => g.id === e.id))]
      saveSavedEvents(merged)
    } catch (e) {
      setError(`문서 생성 실패: ${e instanceof Error ? e.message : "오류"}`)
    } finally { setGenerating(false) }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files) return
    for (const file of Array.from(files)) {
      const b64 = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(",")[1]); r.readAsDataURL(file) })
      setImages((prev) => [...prev, { id: crypto.randomUUID(), filename: file.name, base64: b64 }])
    }
  }

  const canNext = () => {
    const key = steps[step].key
    if (key === "profile") return selectedProfileIds.size > 0
    if (key === "destination") return !!destination
    if (key === "date") return !!startDate
    return true
  }

  function renderStep() {
    const key = steps[step].key

    if (key === "profile") return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">문서를 생성할 학생들을 선택하세요 (여러 명 가능)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {profiles.map((p) => (
            <Card key={p.id}
              className={`cursor-pointer transition hover:border-primary ${selectedProfileIds.has(p.id) ? "border-primary ring-2 ring-primary/20" : ""}`}
              onClick={() => toggleProfile(p.id)}
            >
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <Avatar className="w-12 h-12"><AvatarFallback className={`font-bold ${selectedProfileIds.has(p.id) ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>{p.studentName.charAt(0)}</AvatarFallback></Avatar>
                <div><div className="text-sm font-semibold">{p.studentName}</div><div className="text-xs text-muted-foreground">{p.grade}-{p.class} {p.number}번</div></div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${selectedProfileIds.has(p.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                  {selectedProfileIds.has(p.id) && <Check className="w-3 h-3" />}
                </div>
              </CardContent>
            </Card>
          ))}
          <Card className="cursor-pointer hover:border-primary border-dashed" onClick={openAddProfile}>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2 h-full min-h-[120px]">
              <Plus className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">새 프로필 추가</span>
            </CardContent>
          </Card>
        </div>
        {selectedProfileIds.size > 0 && (
          <Badge variant="secondary" className="text-xs">{selectedProfileIds.size}명 선택됨</Badge>
        )}
      </div>
    )

    if (key === "destination") return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground flex-1">장소를 검색해주세요</p>
          <div className="flex rounded-lg bg-muted p-0.5">
            <button onClick={() => { setTravelType("domestic"); setSearchMode("osm") }} className={`px-3 py-1 text-xs rounded-md font-medium transition ${travelType === "domestic" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>국내</button>
            <button onClick={() => setTravelType("international")} className={`px-3 py-1 text-xs rounded-md font-medium transition ${travelType === "international" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>해외</button>
          </div>
        </div>
        {travelType === "international" ? (
          <div className="space-y-3">
            <Input placeholder="예: Amazon Web Services, Seattle, USA" value={destinationRaw} onChange={(e) => setDestinationRaw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchDestination()} />
            <div className="flex gap-2">
              <Button onClick={searchDestination} disabled={!destinationRaw || polishing === "destination"} size="sm" variant="outline">
                {polishing === "destination" ? "검색 중..." : "OSM 검색"}
              </Button>
              <Button onClick={() => { setDestination(destinationRaw); setDestinationFull(""); setDestinationResults([]) }} disabled={!destinationRaw} size="sm" variant="outline">
                직접 입력
              </Button>
            </div>
            {destination && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  {editingDestination ? (
                    <div className="space-y-2">
                      <Input className="text-sm" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="장소명" />
                      <Input className="text-sm" value={destinationFull} onChange={(e) => setDestinationFull(e.target.value)} placeholder="주소" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setEditingDestination(false)}>확인</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingDestination(false)}>취소</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{destination}</div>
                        {destinationFull && <div className="text-xs text-muted-foreground mt-0.5">{destinationFull}</div>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setEditingDestination(true)}><Pencil className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => { setDestination(""); setDestinationFull(""); setDestinationResults([]) }}><X className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-muted p-0.5 flex-shrink-0">
                <button onClick={() => setSearchMode("osm")} className={`px-3 py-1 text-xs rounded-md font-medium transition ${searchMode === "osm" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>OSM</button>
                <button onClick={() => setSearchMode("ai")} className={`px-3 py-1 text-xs rounded-md font-medium transition ${searchMode === "ai" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>AI 검색</button>
              </div>
            </div>
            <div className="flex gap-2">
              <Input placeholder="예: 국립중앙박물관, AWS 코리아..." value={destinationRaw} onChange={(e) => setDestinationRaw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchDestination()} />
              <Button onClick={searchDestination} disabled={!destinationRaw || polishing === "destination"}>
                {polishing === "destination" ? "검색 중..." : "검색"}
              </Button>
            </div>
          </>
        )}

        {destinationResults.length > 0 && !destination && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">검색 결과 — 선택해주세요</p>
            {destinationResults.map((r, i) => (
              <Card key={i} className="cursor-pointer hover:border-primary transition" onClick={() => selectDestination(r)}>
                <CardContent className="p-3 text-sm">{r}</CardContent>
              </Card>
            ))}
          </div>
        )}

        {destination && travelType !== "international" && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              {editingDestination ? (
                <div className="space-y-2">
                  <Input className="text-sm" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="장소명" />
                  <Input className="text-sm" value={destinationFull} onChange={(e) => setDestinationFull(e.target.value)} placeholder="주소" />
                  <div className="flex gap-2"><Button size="sm" onClick={() => setEditingDestination(false)}>확인</Button><Button size="sm" variant="ghost" onClick={() => setEditingDestination(false)}>취소</Button></div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{destination}</div>
                    {destinationFull && <div className="text-xs text-muted-foreground mt-0.5">{destinationFull}</div>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setEditingDestination(true)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => { setDestination(""); setDestinationFull(""); setDestinationResults([]) }}><X className="w-3 h-3" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    )

    if (key === "date") return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">자연어로 입력하면 AI가 날짜로 바꿔드려요</p>
        <div className="flex gap-2">
          <Input placeholder="예: 다음주 수요일부터 목요일, 7월 15일부터 16일..." value={dateRaw} onChange={(e) => setDateRaw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aiParseDate()} />
          <Button onClick={aiParseDate} disabled={!dateRaw || polishing === "date"}>
            <Sparkles className="w-4 h-4 mr-1" /> {polishing === "date" ? "변환 중..." : "변환"}
          </Button>
        </div>
        {(startDate || endDate) && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-semibold">{formatDateWithDay(startDate)} ~ {formatDateWithDay(endDate)}</div>
                <div className="text-xs text-muted-foreground">이 기간으로 확정되었습니다</div>
              </div>
              <Check className="w-5 h-5 text-primary" />
            </CardContent>
          </Card>
        )}
        <div className="flex gap-2">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="시작일" />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="종료일" />
        </div>
      </div>
    )

    if (key === "purpose") return (
      <div className="space-y-4">
        <Textarea rows={3} placeholder="예: 역사 문화 체험 및 견학을 통해..." value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => aiPolish("purpose")} disabled={polishing === "purpose" || !purpose}>
          <Sparkles className="w-3 h-3 mr-1" /> {polishing === "purpose" ? "다듬는 중..." : "AI로 다듬기"}
        </Button>
      </div>
    )

    if (key === "plan") return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">대략적인 계획을 적으면 AI가 다듬어드려요</p>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["short", "long"] as ContentLength[]).map((len) => (
                <button key={len} onClick={() => setContentLength(len)} className={`px-3 py-1 text-xs rounded-md font-medium transition ${contentLength === len ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{len === "short" ? "짧게" : "길게"}</button>
              ))}
            </div>
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["plain", "polite"] as WritingStyle[]).map((s) => (
                <button key={s} onClick={() => setWritingStyle(s)} className={`px-3 py-1 text-xs rounded-md font-medium transition ${writingStyle === s ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{s === "plain" ? "음슴체" : "존댓말"}</button>
              ))}
            </div>
          </div>
        </div>
        <Textarea rows={8} placeholder="예: 박물관 관람, 전시회 참관&#10;문화재 탐방, 체험 활동" value={plan} onChange={(e) => setPlan(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => aiPolish("plan")} disabled={polishing === "plan" || !plan}>
          <Sparkles className="w-3 h-3 mr-1" /> {polishing === "plan" ? "다듬는 중..." : "AI로 다듬기"}
        </Button>
      </div>
    )

    if (key === "content") return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">무엇을 했는지 대략적으로 적으면 AI가 보고서 말투로 다듬어드려요</p>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["short", "long"] as ContentLength[]).map((len) => (
                <button key={len} onClick={() => setContentLength(len)} className={`px-3 py-1 text-xs rounded-md font-medium transition ${contentLength === len ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{len === "short" ? "짧게" : "길게"}</button>
              ))}
            </div>
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["plain", "polite"] as WritingStyle[]).map((s) => (
                <button key={s} onClick={() => setWritingStyle(s)} className={`px-3 py-1 text-xs rounded-md font-medium transition ${writingStyle === s ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{s === "plain" ? "음슴체" : "존댓말"}</button>
              ))}
            </div>
          </div>
        </div>
        <Textarea rows={8} placeholder="예: 박물관에 도착하여 전시를 관람했다. 오후에는 체험 프로그램에 참여했다." value={content} onChange={(e) => setContent(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => aiPolish("content")} disabled={polishing === "content" || !content}>
          <Sparkles className="w-3 h-3 mr-1" /> {polishing === "content" ? "다듬는 중..." : "AI로 다듬기"}
        </Button>
      </div>
    )

    if (key === "learnings") return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">배운 점을 적으면 AI가 보고서 말투로 다듬어드려요</p>
        <Textarea rows={8} placeholder="예: 역사에 대해 더 깊이 이해하게 되었다. 친구들과 협력하는 법을 배웠다." value={learnings} onChange={(e) => setLearnings(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => aiPolish("learnings")} disabled={polishing === "learnings" || !learnings}>
          <Sparkles className="w-3 h-3 mr-1" /> {polishing === "learnings" ? "다듬는 중..." : "AI로 다듬기"}
        </Button>
      </div>
    )

    if (key === "guardian") return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="보호자 성함" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
          <Input placeholder="관계 (부/모)" value={guardianRelation} onChange={(e) => setGuardianRelation(e.target.value)} />
          <Input placeholder="연락처" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="col-span-2" />
        </div>
      </div>
    )

    if (key === "generate") return (
      <div className="space-y-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-semibold mb-1">선택된 학생 ({selectedProfiles.length}명)</div>
            {selectedProfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <Avatar className="w-6 h-6"><AvatarFallback className="text-[10px]">{p.studentName.charAt(0)}</AvatarFallback></Avatar>
                <span className="font-medium">{p.studentName}</span>
                <span className="text-muted-foreground">{p.grade}-{p.class} {p.number}번</span>
              </div>
            ))}
            {destination && <div className="flex items-center gap-2 text-sm pt-2 border-t"><MapPin className="w-4 h-4 text-muted-foreground" /> {destination}</div>}
            {startDate && <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4 text-muted-foreground" /> {formatDateWithDay(startDate)} ~ {formatDateWithDay(endDate)}</div>}
            {purpose && <div className="flex items-center gap-2 text-sm"><Target className="w-4 h-4 text-muted-foreground" /> {purpose}</div>}
          </CardContent>
        </Card>

        {docType === "report" && (
          <>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" asChild>
                <label className="cursor-pointer"><ImageIcon className="w-4 h-4" /><input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} /></label>
              </Button>
              {images.length > 0 && <span className="text-xs text-muted-foreground">{images.length}장 첨부됨</span>}
            </div>
            {images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {images.map((img) => (
                  <div key={img.id} className="relative flex-shrink-0 group">
                    <img src={`data:image/jpeg;base64,${img.base64}`} className="w-16 h-16 object-cover rounded-lg border" />
                    <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100" onClick={() => setImages((p) => p.filter((x) => x.id !== img.id))}>
                      <span className="text-[10px]">&times;</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {docType === "application" && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold">작성 중 신청서 공유</div>
                <div className="text-xs text-muted-foreground mt-1">인적사항과 보호자 정보는 제외하고 장소, 기간, 목적, 내용만 공유합니다.</div>
              </div>
              <Button variant="outline" size="sm" onClick={shareApplicationDraft}>공유 링크 만들기</Button>
              {shareUrl && <Input readOnly value={shareUrl} className="text-xs" onFocus={(e) => e.currentTarget.select()} />}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button className="flex-1" size="lg" disabled={generating || selectedProfiles.length === 0} onClick={() => handleGenerate("hwp")}>
            <FileDown className="w-4 h-4 mr-2" /> {generating ? "생성 중..." : `HWP 다운로드 (${selectedProfiles.length}명)`}
          </Button>
          <Button className="flex-1" size="lg" variant="secondary" disabled={generating || selectedProfiles.length === 0} onClick={() => handleGenerate("pdf")}>
            <FileText className="w-4 h-4 mr-2" /> {generating ? "생성 중..." : `PDF 다운로드 (${selectedProfiles.length}명)`}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-3 bg-card flex-shrink-0">
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => router.push("/")}><ArrowLeft className="w-4 h-4" /></Button>
        <h1 className="font-semibold text-sm flex-1">{docType === "application" ? "체험학습 신청서" : "체험학습 보고서"}</h1>
        <Select value={model} onValueChange={(v) => setModel(v as ModelId)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{MODELS.map((m) => (<SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>))}</SelectContent>
        </Select>
      </header>

      <div className="border-b bg-card px-4 py-3 flex-shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 w-max min-w-full justify-start sm:justify-center mx-auto">
          {steps.map((s, i) => (
            <button key={s.key} type="button" onClick={() => setStep(i)} className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-xs transition cursor-pointer hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline whitespace-nowrap">{s.title}</span>
              {i < steps.length - 1 && <div className={`w-4 h-px ${i < step ? "bg-primary" : "bg-muted"}`} />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-lg mx-auto">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="flex-shrink-0"><X className="w-3 h-3" /></button>
              </div>
            )}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  {(() => { const Icon = steps[step].icon; return <Icon className="w-5 h-5 text-primary" /> })()}
                  <CardTitle className="text-lg">{steps[step].title}</CardTitle>
                </div>
                <CardDescription>{steps[step].desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {renderStep()}
              </CardContent>
            </Card>

            {step < steps.length - 1 && (
              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> 이전
                </Button>
                <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                  다음 <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <aside className="w-64 border-l bg-card flex-shrink-0 overflow-y-auto p-5 hidden lg:block">
          <h3 className="text-sm font-bold text-foreground mb-4">진행 상황</h3>
          <div className="space-y-4">
            {selectedProfiles.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">인적사항</div>
                {selectedProfiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 text-sm">
                    <Avatar className="w-7 h-7"><AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">{p.studentName.charAt(0)}</AvatarFallback></Avatar>
                    <div>
                      <div className="font-medium">{p.studentName}</div>
                      <div className="text-xs text-muted-foreground">{p.grade}-{p.class} {p.number}번</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {destination && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">장소 {travelType === "international" ? "(해외)" : ""}</div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium">{destination}</div>
                    {destinationFull && (
                      <div className="text-xs text-muted-foreground mt-0.5">{destinationFull}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {startDate && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">기간</div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="font-medium">{formatDateWithDay(startDate)} ~ {formatDateWithDay(endDate)}</span>
                </div>
              </div>
            )}
            {purpose && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">목적</div>
                <div className="text-sm">{purpose}</div>
              </div>
            )}
            {!selectedProfiles.length && !destination && !startDate && !purpose && (
              <div className="text-sm text-muted-foreground">아직 입력된 내용이 없습니다</div>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editingProfile ? "인적사항 수정" : "인적사항 추가"}</DialogTitle></DialogHeader>
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
            <Button onClick={handleSaveProfile}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">로딩 중...</div>}>
      <ChatContent />
    </Suspense>
  )
}
