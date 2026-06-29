export type DocType = "application" | "report"
export type ContentLength = "short" | "long"
export type WritingStyle = "polite" | "plain"
export type TravelType = "domestic" | "international"

export const MODELS = [
  { id: "gemini-3-flash-agent", label: "Gemini 3 Flash" },
  { id: "gemini-3-pro", label: "Gemini 3 Pro" },
  { id: "gpt-5.4-mini", label: "GPT 5.4 Mini" },
  { id: "glm-5.2", label: "GLM 5.2" },
  { id: "deepseek-v4-pro", label: "Deepseek V4 Pro" },
  { id: "deepseek-v4-flash", label: "Deepseek V4 Flash" },
] as const

export type ModelId = (typeof MODELS)[number]["id"]

export interface Profile {
  id: string
  grade: string
  class: string
  number: string
  studentName: string
}

export interface ChatContext {
  selectedProfileId: string | null
  startDate: string
  endDate: string
  destination: string
  purpose: string
  contentLength: ContentLength
}

export interface ApplicationData {
  grade: string
  class: string
  number: string
  studentName: string
  guardianName: string
  guardianRelation: string
  guardianPhone: string
  startDate: string
  endDate: string
  destination: string
  destinationFull?: string
  purpose: string
  plan: string
  submittedDate: string
  travelType?: TravelType
}

export interface ReportData {
  studentName: string
  grade: string
  class: string
  number: string
  title: string
  startDate: string
  endDate: string
  destination: string
  destinationFull?: string
  purpose: string
  content: string
  learnings: string
  submittedDate: string
  travelType?: TravelType
}

export interface ImageAttachment {
  id: string
  filename: string
  base64: string
}

export interface Draft {
  id: string
  docType: DocType
  title: string
  step: number
  lastModified: string
  data: DraftData
}

export interface DraftData {
  selectedProfileIds: string[]
  destination: string
  destinationFull: string
  startDate: string
  endDate: string
  purpose: string
  plan: string
  content: string
  learnings: string
  contentLength: ContentLength
  writingStyle: WritingStyle
  travelType: TravelType
  guardianName: string
  guardianRelation: string
  guardianPhone: string
}

export interface SharedApplicationDraft {
  id: string
  createdAt: string
  data: Omit<DraftData, "selectedProfileIds" | "guardianName" | "guardianRelation" | "guardianPhone">
}

export interface SavedEvent {
  id: string
  docType: DocType
  title: string
  studentName: string
  date: string
  lastModified: string
  extractedData: Partial<ApplicationData | ReportData>
  messages: ChatMessage[]
  images: ImageAttachment[]
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}
