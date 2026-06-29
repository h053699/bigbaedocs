"use server"

export async function searchPlace(query: string, international = false): Promise<{ results: string[]; error?: string }> {
  try {
    const params = new URLSearchParams({ q: query, format: "json", "accept-language": "ko", limit: "5" })
    if (!international) params.set("countrycodes", "kr")

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { "User-Agent": "BigBaeDocs/1.0" } }
    )

    if (!res.ok) {
      return { results: [], error: `OSM API 오류: ${res.status} ${res.statusText}` }
    }

    const data = await res.json()
    const results = (data as Array<{ display_name: string }>).map((d) => d.display_name)
    return { results }
  } catch {
    return { results: [], error: "OSM API 호출 실패" }
  }
}
