"use server"

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { ApplicationData, ReportData, DocType, ImageAttachment } from "@/lib/types"

function formatDate(dateStr: string) {
  if (!dateStr) return "____년 __월 __일"
  const d = new Date(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

const safe = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const escapeHwpxText = (s: string) => safe(s || " ")

function trimHwpxText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxChars) return normalized || " "
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`
}

function wrapHwpxText(value: string, maxCharsPerLine: number, maxLines: number) {
  const sourceLines = value
    .split(/\r?\n/)
    .flatMap((line) => {
      const words = line.trim().split(/\s+/).filter(Boolean)
      if (words.length === 0) return [""]

      const lines: string[] = []
      let current = ""
      for (const word of words) {
        if (!current) {
          current = word
        } else if (`${current} ${word}`.length <= maxCharsPerLine) {
          current = `${current} ${word}`
        } else {
          lines.push(current)
          current = word
        }

        while (current.length > maxCharsPerLine) {
          lines.push(current.slice(0, maxCharsPerLine))
          current = current.slice(maxCharsPerLine)
        }
      }
      if (current) lines.push(current)
      return lines
    })
    .filter((line, index, lines) => line || index === 0 || index === lines.length - 1)

  const lines = sourceLines.length ? sourceLines : [" "]
  if (lines.length <= maxLines) return lines
  const clipped = lines.slice(0, maxLines)
  clipped[maxLines - 1] = trimHwpxText(clipped[maxLines - 1], maxCharsPerLine)
  return clipped
}

function replaceHwpxInline(xml: string, placeholder: string, value: string, maxChars?: number) {
  const text = escapeHwpxText(maxChars ? trimHwpxText(value, maxChars) : value)
  return xml.replace(new RegExp(escapeRegExp(placeholder), "g"), text)
}

function replaceHwpxParagraph(xml: string, placeholder: string, value: string, maxCharsPerLine: number, maxLines: number) {
  const paragraphPattern = new RegExp(`<hp:p\\b(?:(?!<\\/hp:p>).)*${escapeRegExp(placeholder)}(?:(?!<\\/hp:p>).)*<\\/hp:p>`, "s")
  const match = xml.match(paragraphPattern)
  if (!match) return replaceHwpxInline(xml, placeholder, value, maxCharsPerLine * maxLines)

  const paragraph = match[0]
  const runStart = paragraph.match(/<hp:run\b[^>]*>/)?.[0] ?? '<hp:run charPrIDRef="8">'
  const blankParagraph = paragraph
    .replace(/<hp:run\b[\s\S]*?<\/hp:run>/g, "")
    .replace(/<hp:linesegarray[\s\S]*?<\/hp:linesegarray>/gi, "")

  const paragraphs = wrapHwpxText(value, maxCharsPerLine, maxLines)
    .map((line) => blankParagraph.replace(/(<hp:p\b[^>]*>)/, `$1${runStart}<hp:t>${escapeHwpxText(line)}</hp:t></hp:run>`))
    .join("")

  return xml.replace(paragraph, paragraphs)
}

function buildImageTags(images: ImageAttachment[], binPrefix: string): string {
  return images
    .map(
      (img, i) =>
        `<PICTURE binary_item_id_ref="${binPrefix}${String(i + 1).padStart(4, "0")}">` +
        `<SHAPE></SHAPE>` +
        `</PICTURE>`
    )
    .join("\n")
}

function buildApplicationHwpml(data: ApplicationData, images: ImageAttachment[]): string {
  const planLines = data.plan
    .split("\n")
    .filter(Boolean)
    .map((line) => `<P><TEXT>${safe(line)}</TEXT></P>`)
    .join("\n")

  const imageSection = images.length > 0
    ? `<P><TEXT> </TEXT></P><P><TEXT>[첨부 사진]</TEXT></P>${buildImageTags(images, "BIN")}`
    : ""

  return `<?xml version="1.0" encoding="utf-8"?>
<HWPML version="5.1.1.0" xmlns="http://www.hancom.co.kr/hwpml/2016">
  <HEAD><BEGINNUMPAGES/></HEAD>
  <BODY><SECTION>
    <P><TEXT>체 험 학 습 신 청 서</TEXT></P>
    <P><TEXT> </TEXT></P>
    <TABLE>
      <ROW><CELL><P><TEXT>학년 / 반 / 번호</TEXT></P></CELL><CELL><P><TEXT>${safe(data.grade)}학년 ${safe(data.class)}반 ${safe(data.number)}번</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>성 명</TEXT></P></CELL><CELL><P><TEXT>${safe(data.studentName)}</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>보호자 성명</TEXT></P></CELL><CELL><P><TEXT>${safe(data.guardianName)} (${safe(data.guardianRelation)})</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>보호자 연락처</TEXT></P></CELL><CELL><P><TEXT>${safe(data.guardianPhone)}</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>기 간</TEXT></P></CELL><CELL><P><TEXT>${formatDate(data.startDate)} ~ ${formatDate(data.endDate)}</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>장 소</TEXT></P></CELL><CELL><P><TEXT>${safe(data.destination)}</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>목 적</TEXT></P></CELL><CELL><P><TEXT>${safe(data.purpose)}</TEXT></P></CELL></ROW>
    </TABLE>
    <P><TEXT> </TEXT></P>
    <P><TEXT>체험학습 계획</TEXT></P>
    ${planLines}
    ${imageSection}
    <P><TEXT> </TEXT></P>
    <P><TEXT>신청일: ${formatDate(data.submittedDate)}</TEXT></P>
    <P><TEXT> </TEXT></P>
    <P><TEXT>위와 같이 체험학습을 신청합니다.</TEXT></P>
    <P><TEXT>신청인(학생): ________________ (서명)</TEXT></P>
    <P><TEXT>보호자: ________________ (서명)</TEXT></P>
  </SECTION></BODY>
</HWPML>`
}

function buildReportHwpml(data: ReportData, images: ImageAttachment[]): string {
  const contentLines = data.content
    .split("\n")
    .filter(Boolean)
    .map((line) => `<P><TEXT>${safe(line)}</TEXT></P>`)
    .join("\n")

  const learningLines = data.learnings
    .split("\n")
    .filter(Boolean)
    .map((line) => `<P><TEXT>${safe(line)}</TEXT></P>`)
    .join("\n")

  const imageSection = images.length > 0
    ? `<P><TEXT> </TEXT></P><P><TEXT>[첨부 사진]</TEXT></P>${buildImageTags(images, "BIN")}`
    : ""

  return `<?xml version="1.0" encoding="utf-8"?>
<HWPML version="5.1.1.0" xmlns="http://www.hancom.co.kr/hwpml/2016">
  <HEAD><BEGINNUMPAGES/></HEAD>
  <BODY><SECTION>
    <P><TEXT>체 험 학 습 보 고 서</TEXT></P>
    <P><TEXT> </TEXT></P>
    <P><TEXT>제목: ${safe(data.title)}</TEXT></P>
    <P><TEXT> </TEXT></P>
    <TABLE>
      <ROW><CELL><P><TEXT>학년 / 반</TEXT></P></CELL><CELL><P><TEXT>${safe(data.grade)}학년 ${safe(data.class)}반</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>성 명</TEXT></P></CELL><CELL><P><TEXT>${safe(data.studentName)}</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>기 간</TEXT></P></CELL><CELL><P><TEXT>${formatDate(data.startDate)} ~ ${formatDate(data.endDate)}</TEXT></P></CELL></ROW>
      <ROW><CELL><P><TEXT>장 소</TEXT></P></CELL><CELL><P><TEXT>${safe(data.destination)}</TEXT></P></CELL></ROW>
    </TABLE>
    <P><TEXT> </TEXT></P>
    <P><TEXT>체험학습 내용</TEXT></P>
    ${contentLines}
    <P><TEXT> </TEXT></P>
    <P><TEXT>배운 점 / 느낀 점</TEXT></P>
    ${learningLines}
    ${imageSection}
    <P><TEXT> </TEXT></P>
    <P><TEXT>작성일: ${formatDate(data.submittedDate)}</TEXT></P>
    <P><TEXT>작성자: ${safe(data.studentName)} (인)</TEXT></P>
  </SECTION></BODY>
</HWPML>`
}

export async function generateHwpAction(
  docType: DocType,
  data: ApplicationData | ReportData,
  images: ImageAttachment[]
): Promise<string> {
  // 1. HWPX 템플릿 치환 방식 시도
  const templateName = docType === "application" ? "template-1.hwpx" : "template-2.hwpx"
  const hwpxPath = join(process.cwd(), "public/templates", templateName)
  
  if (existsSync(hwpxPath)) {
    const JSZip = (await import("jszip")).default
    const zip = new JSZip()
    const content = readFileSync(hwpxPath)
    await zip.loadAsync(content)

    // Contents/section0.xml 안의 텍스트 치환
    const sectionFile = zip.file("Contents/section0.xml")
    if (sectionFile) {
      let xml = await sectionFile.async("string")
      const d = data

      // 날짜 계산 헬퍼
      const sd = d.startDate ? new Date(d.startDate) : new Date()
      const ed = d.endDate ? new Date(d.endDate) : new Date()
      const days = ["일", "월", "화", "수", "목", "금", "토"]
      const sub = d.submittedDate ? new Date(d.submittedDate) : new Date()

      // 기간 계산 (간단한 일수 차이)
      const diffTime = Math.abs(ed.getTime() - sd.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

      // 텍스트 매핑
      const replacements: Record<string, string> = {
        "{1}": d.grade || " ", "{2}": d.class || " ", "{3}": d.number || " ", "{4}": d.studentName || " ",
        "{5}": String(sd.getFullYear()), "{6}": String(sd.getMonth() + 1), "{7}": String(sd.getDate()), "{8}": days[sd.getDay()],
        "{9}": String(ed.getFullYear()), "{10}": String(ed.getMonth() + 1), "{11}": String(ed.getDate()), "{12}": days[ed.getDay()],
        "{13}": String(diffDays),
        "{14}": d.destinationFull || d.destination || " ",
        "{15}": d.purpose || " ",
        "{16}": docType === "application" ? ((d as ApplicationData).plan || " ") : ((d as ReportData).content || " "),
        "{17}": docType === "application" ? ((d as ApplicationData).guardianName || " ") : ((d as ReportData).learnings || " "),
        "{18}": docType === "application" ? ((d as ApplicationData).travelType === "international" ? ((d as ApplicationData).guardianRelation || " ") : " ") : "첨부파일 참조",
        "{19}": docType === "application" ? ((d as ApplicationData).travelType === "international" ? ((d as ApplicationData).guardianPhone || " ") : " ") : " ",
        "{20}": String(sub.getFullYear()), "{21}": String(sub.getMonth() + 1), "{22}": String(sub.getDate()),
        "{23}": d.studentName || " ",
        "{24}": (d as ApplicationData).guardianName || " ",
      }

      const paragraphLimits: Record<string, { maxCharsPerLine: number; maxLines: number }> =
        docType === "application"
          ? {
              "{14}": { maxCharsPerLine: 81, maxLines: 2 },
              "{15}": { maxCharsPerLine: 39, maxLines: 2 },
              "{16}": { maxCharsPerLine: 81, maxLines: 4 },
            }
          : {
              "{14}": { maxCharsPerLine: 81, maxLines: 2 },
              "{15}": { maxCharsPerLine: 39, maxLines: 2 },
              "{16}": { maxCharsPerLine: 81, maxLines: 3 },
              "{17}": { maxCharsPerLine: 81, maxLines: 4 },
              "{18}": { maxCharsPerLine: 40, maxLines: 2 },
            }

      for (const [key, value] of Object.entries(replacements)) {
        const limit = paragraphLimits[key]
        if (limit) {
          xml = replaceHwpxParagraph(xml, key, value, limit.maxCharsPerLine, limit.maxLines)
        } else {
          xml = replaceHwpxInline(xml, key, value, 28)
        }
      }

      zip.file("Contents/section0.xml", xml)
    }

    const newZip = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    const base64 = newZip.toString("base64")
    return `data:application/octet-stream;base64,${base64}`
  }

  // 2. HWPX가 없으면 기존 cfb + HWPML 방식(레거시)으로 생성
  const { utils, write, read } = await import("cfb")
  let cfb: ReturnType<typeof utils.cfb_new>
  const templatePath = join(process.cwd(), "public/templates/template.hwp")
  try {
    const templateBuf = readFileSync(templatePath)
    cfb = read(templateBuf, { type: "buffer" })
  } catch {
    cfb = utils.cfb_new()
    const sig = new TextEncoder().encode("HWP Document File\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0")
    const headerBuf = new Uint8Array(256)
    headerBuf.fill(0)
    headerBuf.set(sig, 0)
    const dv = new DataView(headerBuf.buffer)
    dv.setUint32(32, 0x05010001, true)
    dv.setUint32(36, 0x05, true)
    dv.setUint16(40, 0x0000, true)
    utils.cfb_add(cfb, "FileHeader", Array.from(headerBuf), { unsafe: true })
  }

  const hwpml =
    docType === "application"
      ? buildApplicationHwpml(data as ApplicationData, images)
      : buildReportHwpml(data as ReportData, images)

  const sectionContent = new TextEncoder().encode(hwpml)
  utils.cfb_add(cfb, "BodyText/Section0", Array.from(sectionContent), { unsafe: true })

  for (let i = 0; i < images.length; i++) {
    const imgBuf = Buffer.from(images[i].base64, "base64")
    const ext = images[i].filename.split(".").pop()?.toLowerCase() ?? "jpg"
    const name = `BinData/BIN${String(i + 1).padStart(4, "0")}.${ext}`
    utils.cfb_add(cfb, name, Array.from(imgBuf), { unsafe: true })
  }

  const out = utils.prep_blob(write(cfb, { type: "buffer", fileType: "cfb" }))
  const base64 = Buffer.from(out).toString("base64")
  return `data:application/octet-stream;base64,${base64}`
}

export async function generatePdfAction(
  docType: DocType,
  data: ApplicationData | ReportData,
  images: ImageAttachment[]
): Promise<string> {
  const { default: React } = await import("react")
  const { renderToBuffer, Document, Page, Text, View, StyleSheet, Font, Image } = await import(
    "@react-pdf/renderer"
  )

  const regularBase64 = readFileSync(join(process.cwd(), "public/fonts/NanumGothic-Regular.woff2")).toString("base64")
  const boldBase64 = readFileSync(join(process.cwd(), "public/fonts/NanumGothic-Bold.woff2")).toString("base64")

  Font.register({
    family: "Nanum Gothic",
    fonts: [
      { src: `data:font/woff2;base64,${regularBase64}`, fontWeight: 400 },
      { src: `data:font/woff2;base64,${boldBase64}`, fontWeight: 700 },
    ],
  })

  const s = StyleSheet.create({
    page: { padding: "40px 50px", fontFamily: "Nanum Gothic", fontSize: 10, lineHeight: 1.5, color: "#000" },
    title: { fontSize: 24, fontWeight: 700, textAlign: "center", marginBottom: 20, letterSpacing: 2 },
    
    // 결재란
    approvalBox: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 15 },
    approvalTable: { flexDirection: "row", border: "1px solid #000" },
    approvalHeader: { width: 20, borderRight: "1px solid #000", alignItems: "center", justifyContent: "center", backgroundColor: "#f9f9f9" },
    approvalCol: { width: 60, borderRight: "1px solid #000" },
    approvalColLast: { width: 60 },
    approvalTitle: { borderBottom: "1px solid #000", textAlign: "center", padding: 3, fontSize: 9 },
    approvalSign: { height: 40 },

    // 안내문
    notice: { fontSize: 9, lineHeight: 1.6, marginBottom: 10 },
    noticeBox: { border: "1px solid #000", padding: 10, marginBottom: 15, fontSize: 9, lineHeight: 1.5 },

    // 메인 테이블
    table: { border: "2px solid #000", borderBottom: "1px solid #000" },
    row: { flexDirection: "row", borderBottom: "1px solid #000", minHeight: 28, alignItems: "center" },
    rowLarge: { flexDirection: "row", borderBottom: "1px solid #000", minHeight: 200 },
    th: { width: 80, borderRight: "1px solid #000", textAlign: "center", fontWeight: 700, padding: 5, backgroundColor: "#f9f9f9" },
    td: { flex: 1, padding: "5px 10px" },
    
    // 테이블 내부 분할
    innerRow: { flexDirection: "row", borderBottom: "1px solid #ccc", padding: "5px 10px" },
    innerRowLast: { flexDirection: "row", padding: "5px 10px" },

    // 국내외 여행란
    travelRow: { flexDirection: "row", borderBottom: "1px solid #000", minHeight: 28, alignItems: "center" },
    travelTh: { width: 120, borderRight: "1px solid #000", textAlign: "center", fontWeight: 700, backgroundColor: "#f9f9f9" },
    travelTd: { flex: 1, borderRight: "1px solid #000", textAlign: "center", padding: 4 },
    travelTdLast: { flex: 1, textAlign: "center", padding: 4 },

    // 하단 서명란
    signatureArea: { border: "2px solid #000", borderTop: 0, padding: "20px 40px", textAlign: "center" },
    sigText: { fontSize: 11, marginBottom: 15 },
    sigDate: { fontSize: 11, marginBottom: 15 },
    sigPerson: { flexDirection: "row", justifyContent: "center", gap: 20, marginBottom: 8 },
    sigPrincipal: { fontSize: 14, fontWeight: 700, marginTop: 15 },

    // 맨 아래 확인란
    bottomTable: { flexDirection: "row", border: "2px solid #000", borderTop: "1px solid #000", minHeight: 40, alignItems: "center" },
    bottomTh: { width: 120, borderRight: "1px solid #000", textAlign: "center", fontWeight: 700, backgroundColor: "#f9f9f9", padding: 5 },
    bottomTd: { flex: 1, padding: "5px 10px" },

    // 공통
    bold: { fontWeight: 700 },
    imgWrap: { marginTop: 10 },
    img: { maxWidth: "100%", maxHeight: 200, objectFit: "contain" }
  })

  const fDate = (ds: string) => {
    if (!ds) return "____년 __월 __일 (  )"
    const d = new Date(ds)
    const days = ["일", "월", "화", "수", "목", "금", "토"]
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ( ${days[d.getDay()]}요일 )`
  }
  
  const getDays = (s: string, e: string) => {
    if (!s || !e) return " "
    const diff = Math.ceil(Math.abs(new Date(e).getTime() - new Date(s).getTime()) / (1000 * 60 * 60 * 24)) + 1
    return String(diff)
  }

  const renderImages = () =>
    images.map((img) => (
      <View key={img.id} style={s.imgWrap}>
        <Image src={`data:image/jpeg;base64,${img.base64}`} style={s.img} />
      </View>
    ))

  let pdfBuffer: Buffer

  if (docType === "application") {
    const d = data as ApplicationData
    pdfBuffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={s.page}>
          <Text style={s.title}>교외체험학습 신청서</Text>

          <View style={s.approvalBox}>
            <View style={s.approvalTable}>
              <View style={s.approvalHeader}><Text>결{"\n"}재</Text></View>
              <View style={s.approvalCol}><Text style={s.approvalTitle}>담임교사</Text><View style={s.approvalSign}></View></View>
              <View style={s.approvalCol}><Text style={s.approvalTitle}>학년부장</Text><View style={s.approvalSign}></View></View>
              <View style={s.approvalColLast}><Text style={s.approvalTitle}>교감</Text><View style={s.approvalSign}></View></View>
            </View>
          </View>

          <View style={s.notice}>
            <Text>※ 신청서는 교외체험학습 실시 <Text style={s.bold}>최소 2일 전</Text>까지, 보고서는 <Text style={s.bold}>실시 후 7일 이내</Text>에 제출하여야 합니다.</Text>
            <Text>※ <Text style={s.bold}>연속 5일 초과</Text> 교외체험학습 시 학생은 <Text style={s.bold}>주1회 이상 담임교사에게 연락</Text>하여 안전을 확인하도록 합니다.</Text>
            <Text>※ 교외체험학습 실시 후 보고서를 제출하지 않으면 해당 기간을 미인정 결석으로 처리합니다.</Text>
          </View>

          <View style={s.noticeBox}>
            <Text>○ 교육과정 이수에 지장이 없는 범위 내에서 실시한다.</Text>
            <Text>○ 결석일수와 출석인정 결석일수의 총 합이 수업일수의 1/3에 도달하지 않는 범위 내에서 실시한다.</Text>
            <Text>○ 학기 초, 학기 말, 고사 기간, 고사 기간 전후 등은 피해서 실시한다.</Text>
            <Text>   ※ 지필평가 기간, 고사종료일 기준 3일 이내(공휴일 제외) 실시 불가</Text>
            <Text>○ 학부모(보호자)가 동행하지 않는 여행의 경우 안전상의 이유로 허가하지 않음.</Text>
          </View>

          <View style={s.table}>
            <View style={s.row}>
              <Text style={s.th}>인적사항</Text>
              <Text style={s.td}>( {d.grade} )학년 ( {d.class} )반 ( {d.number} )번   이름: ( {d.studentName} )</Text>
            </View>
            <View style={{ flexDirection: "row", borderBottom: "1px solid #000" }}>
              <Text style={{ ...s.th, borderBottom: 0, justifyContent: "center", display: "flex" }}>기 간</Text>
              <View style={{ flex: 1 }}>
                <View style={s.innerRow}>
                  <Text>{fDate(d.startDate)} ~ {fDate(d.endDate)}</Text>
                </View>
                <View style={s.innerRowLast}>
                  <Text>총 ( {getDays(d.startDate, d.endDate)} )일간  ※ 일수 산정 시 토·일요일, 공휴일, 휴업일 제외</Text>
                </View>
              </View>
            </View>
            <View style={s.row}>
              <Text style={s.th}>장 소</Text>
              <Text style={s.td}>{d.destinationFull || d.destination}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.th}>목 적</Text>
              <Text style={s.td}>{d.purpose}</Text>
            </View>
            <View style={s.rowLarge}>
              <Text style={s.th}>내 용</Text>
              <View style={s.td}>
                {d.plan.split("\n").map((ln, i) => <Text key={i} style={{ marginBottom: 4 }}>{ln}</Text>)}
              </View>
            </View>
            <View style={s.travelRow}>
              <Text style={s.travelTh}>국내외 여행의 경우</Text>
              <Text style={{ width: 100, borderRight: "1px solid #000", textAlign: "center", padding: 4 }}>동행하는 보호자명</Text>
              <Text style={s.travelTd}>{d.guardianName}</Text>
              <Text style={{ width: 40, borderRight: "1px solid #000", textAlign: "center", padding: 4 }}>관계</Text>
              <Text style={s.travelTd}>{d.travelType === "international" ? d.guardianRelation : ""}</Text>
              <Text style={{ width: 50, borderRight: "1px solid #000", textAlign: "center", padding: 4 }}>휴대폰</Text>
              <Text style={s.travelTdLast}>{d.travelType === "international" ? d.guardianPhone : ""}</Text>
            </View>
          </View>

          <View style={s.signatureArea}>
            <Text style={s.sigText}>위와 같이 교외체험학습을 신청하오니 허락하여 주시기 바랍니다.</Text>
            <Text style={s.sigDate}>{d.submittedDate.split("-")[0]} . {parseInt(d.submittedDate.split("-")[1])} . {parseInt(d.submittedDate.split("-")[2])} .</Text>
            <View style={s.sigPerson}>
              <Text>학    생 : </Text>
              <Text style={{ width: 60, textAlign: "center" }}>{d.studentName}</Text>
              <Text>(서명 또는 인)</Text>
            </View>
            <View style={s.sigPerson}>
              <Text>학 부 모 : </Text>
              <Text style={{ width: 60, textAlign: "center" }}>{d.guardianName}</Text>
              <Text>(서명 또는 인)</Text>
            </View>
            <Text style={s.sigPrincipal}>선린인터넷고등학교장 귀하</Text>
          </View>

          <View style={s.bottomTable}>
            <Text style={s.bottomTh}>담임 선생님{"\n"}확인 방법 및 일시</Text>
            <Text style={s.bottomTd}>(     )월 (     )일 (                    )(를) 통해 교외체험학습 신청 사항을{"\n"}보호자에게 확인하였음.</Text>
          </View>
        </Page>
      </Document>
    )
  } else {
    const d = data as ReportData
    pdfBuffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={s.page}>
          <Text style={s.title}>교외체험학습 결과 보고서</Text>

          <View style={s.approvalBox}>
            <View style={s.approvalTable}>
              <View style={s.approvalHeader}><Text>결{"\n"}재</Text></View>
              <View style={s.approvalColLast}><Text style={s.approvalTitle}>담임교사</Text><View style={s.approvalSign}></View></View>
            </View>
          </View>

          <View style={s.table}>
            <View style={s.row}>
              <Text style={s.th}>인적사항</Text>
              <Text style={s.td}>( {d.grade} )학년 ( {d.class} )반 ( {d.number || "  "} )번   이름: ( {d.studentName} )</Text>
            </View>
            <View style={{ flexDirection: "row", borderBottom: "1px solid #000" }}>
              <Text style={{ ...s.th, borderBottom: 0, justifyContent: "center", display: "flex" }}>기 간</Text>
              <View style={{ flex: 1 }}>
                <View style={s.innerRow}>
                  <Text>{fDate(d.startDate)} ~ {fDate(d.endDate)}</Text>
                </View>
                <View style={s.innerRowLast}>
                  <Text>총 ( {getDays(d.startDate, d.endDate)} )일간  ※ 일수 산정 시 토·일요일, 공휴일, 휴업일 제외</Text>
                </View>
              </View>
            </View>
            <View style={s.row}>
              <Text style={s.th}>장 소</Text>
              <Text style={s.td}>{d.destinationFull || d.destination}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.th}>목 적</Text>
              <Text style={s.td}>{d.purpose}</Text>
            </View>
            <View style={{ flexDirection: "row", borderBottom: "1px solid #000", minHeight: 150 }}>
              <Text style={s.th}>체험내용</Text>
              <View style={s.td}>
                {d.content.split("\n").map((ln, i) => <Text key={i} style={{ marginBottom: 4 }}>{ln}</Text>)}
              </View>
            </View>
            <View style={{ flexDirection: "row", borderBottom: "1px solid #000", minHeight: 150 }}>
              <Text style={s.th}>느낀 점</Text>
              <View style={s.td}>
                {d.learnings.split("\n").map((ln, i) => <Text key={i} style={{ marginBottom: 4 }}>{ln}</Text>)}
              </View>
            </View>
            <View style={{ minHeight: 150, padding: 10 }}>
              <Text style={{ marginBottom: 10 }}>[첨부자료] (사진, 입장권 등의 관련 증빙자료를 반드시 첨부합니다.)</Text>
              {renderImages()}
            </View>
          </View>
          
          <View style={{ marginTop: 20, textAlign: "center" }}>
            <Text style={s.sigText}>위와 같이 교외체험학습 결과 보고서를 제출합니다.</Text>
            <Text style={s.sigDate}>{d.submittedDate.split("-")[0]} . {parseInt(d.submittedDate.split("-")[1])} . {parseInt(d.submittedDate.split("-")[2])} .</Text>
            <View style={s.sigPerson}>
              <Text>작 성 자 : </Text>
              <Text style={{ width: 60, textAlign: "center" }}>{d.studentName}</Text>
              <Text>(서명 또는 인)</Text>
            </View>
          </View>
        </Page>
      </Document>
    )
  }

  const base64 = Buffer.from(pdfBuffer).toString("base64")
  return `data:application/pdf;base64,${base64}`
}
