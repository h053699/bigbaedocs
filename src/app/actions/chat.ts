"use server"

import OpenAI from "openai"
import type { ApplicationData, ReportData, DocType, ChatMessage, ImageAttachment, ChatContext, Profile } from "@/lib/types"

const client = new OpenAI({
  baseURL: "https://ai.applehouse.dev/v1",
  apiKey: process.env.APPLEHOUSE_API_KEY ?? "no-key",
})

export async function chatAction(
  docType: DocType,
  messages: ChatMessage[],
  images: ImageAttachment[],
  model: string = "gemini-3-flash-agent",
  context?: ChatContext | null,
  profiles?: Profile[] | null,
): Promise<{
  message: string
  extractedData: Partial<ApplicationData | ReportData> | null
  complete: boolean
  error?: string
}> {
  if (!process.env.APPLEHOUSE_API_KEY) {
    return { message: "", extractedData: null, complete: false, error: "APPLEHOUSE_API_KEY가 서버에 설정되지 않았습니다" }
  }

  const systemPrompt = `너는 텍스트 다듬기 도우미야. 사용자가 준 텍스트를 다듬어서 깔끔하게 출력해. 절대 인사말, 설명, 추가 질문을 하지 마. 오직 다듬어진 텍스트만 출력해.`

  const profile = context?.selectedProfileId && profiles
    ? profiles.find((p) => p.id === context.selectedProfileId) ?? null
    : null

  const systemMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ]

  if (profile) {
    systemMessages.push({
      role: "system",
      content: `참고 - 학생: ${profile.grade}학년 ${profile.class}반 ${profile.number}번 ${profile.studentName}`,
    })
  }
  if (context?.destination) {
    systemMessages.push({ role: "system", content: `참고 - 장소: ${context.destination}` })
  }
  if (context?.startDate) {
    systemMessages.push({ role: "system", content: `참고 - 기간: ${context.startDate} ~ ${context.endDate}` })
  }
  if (context?.contentLength) {
    systemMessages.push({
      role: "system",
      content: `참고 - ${context.contentLength === "short" ? "2~3줄로 짧게 작성" : "상세하게 길게 작성"}`,
    })
  }

  const imageContents = images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: `data:image/jpeg;base64,${img.base64}` },
  }))

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        ...systemMessages,
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      stream: false,
      temperature: 0.7,
      max_tokens: 2000,
    })

    const raw = response.choices[0]?.message?.content ?? ""
    return { message: raw.trim(), extractedData: null, complete: false }
  } catch (error) {
    return {
      message: "",
      extractedData: null,
      complete: false,
      error: error instanceof Error ? error.message : "AI API 호출 실패",
    }
  }
}
