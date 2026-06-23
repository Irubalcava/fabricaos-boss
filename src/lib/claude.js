// Claude API via fetch directo
// model: claude-sonnet-4-6

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

export async function generateSummary(prompt) {
  if (!ANTHROPIC_API_KEY) {
    return 'Configura VITE_ANTHROPIC_API_KEY para habilitar resúmenes con IA.'
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-calls': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

export async function suggestCausas(titulo) {
  const prompt = `Eres un consultor de negocios. El usuario describe el siguiente problema en su empresa: "${titulo}".
  Sugiere exactamente 3 posibles causas raíz breves (máximo 15 palabras cada una).
  Responde SOLO con un array JSON: ["causa 1", "causa 2", "causa 3"]`
  const raw = await generateSummary(prompt)
  try {
    const match = raw.match(/\[.*\]/s)
    return match ? JSON.parse(match[0]) : []
  } catch {
    return []
  }
}

export async function suggestProblemaRelacionado(titulo, descripcion, problemas) {
  if (!problemas?.length) return null
  const listaProblemas = problemas.map(p => `- [${p.id}] ${p.titulo}`).join('\n')
  const prompt = `Tenemos una idea: "${titulo}". Descripción: "${descripcion || ''}".
Estos son los problemas actuales del negocio:
${listaProblemas}

¿Esta idea resuelve algún problema de la lista? Si sí, responde SOLO con el UUID del problema más relacionado. Si no, responde "ninguno".`
  const raw = await generateSummary(prompt)
  const trimmed = raw.trim()
  const uuidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return uuidMatch ? uuidMatch[0] : null
}

export async function checkDuplicadoObjetivo(titulo, objetivos) {
  if (!objetivos?.length) return null
  const lista = objetivos.map(o => `- ${o.titulo}`).join('\n')
  const prompt = `El usuario quiere crear el objetivo: "${titulo}".
Objetivos existentes:
${lista}

¿Existe alguno muy similar o duplicado? Responde en máximo 2 oraciones. Si no hay duplicados, responde "Sin duplicados detectados."`
  return await generateSummary(prompt)
}

export async function resumirDecision(decision, votos) {
  const votosSi = votos.filter(v => v.voto === 'si').length
  const votosNo = votos.filter(v => v.voto === 'no').length
  const comentarios = votos.filter(v => v.comentario).map(v => `- ${v.voto === 'si' ? 'A favor' : 'En contra'}: ${v.comentario}`).join('\n')
  const prompt = `Resume esta decisión empresarial en 3-4 oraciones:
Título: ${decision.titulo}
Problema: ${decision.problema || 'No especificado'}
Opciones consideradas: ${decision.opciones || 'No especificadas'}
Votos a favor: ${votosSi}, Votos en contra: ${votosNo}
Comentarios:
${comentarios || 'Sin comentarios'}
Resultado elegido: ${decision.resultado || 'Pendiente'}

Resumen ejecutivo (máx 100 palabras):`
  return await generateSummary(prompt)
}
