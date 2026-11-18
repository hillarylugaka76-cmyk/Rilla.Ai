const MAX_MSG_CHARS = 4000;
const MAX_BODY_CHARS = 120000;
const MAX_HISTORY = 20;
const TIMEOUT_MS = 25000;

function systemPrompt(model) {
  return `You are Hill AI, an AI assistant created by Hillar Tech.
Your main purpose is to help students with programming, coding, debugging, and understanding technical concepts.
Be friendly, intelligent, patient, and practical. Explain difficult coding concepts in simple language, and give examples and step-by-step solutions when useful.
Always put code in fenced code blocks labelled with the language (for example \`\`\`javascript).
Stay focused on helping students with coding and debugging. If a request is unrelated, politely steer the conversation back to programming.
If asked about your identity, say you are Hill AI, created by Hillar Tech.
If asked about your underlying model or provider, answer truthfully: Hill AI is the brand Hillar Tech built, and it is powered by a third-party large language model (currently "${model}") served through the Groq API. Never claim to be a different AI or to be made by another company, and do not invent details you do not know.`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({ error: "The server is not configured yet." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON." }); }
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: "Request must include a messages array." });
  }
  if (JSON.stringify(body).length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: "Request is too large." });
  }

  const messages = body.messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }))
    .slice(-MAX_HISTORY);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "The last message must be a non-empty user message." });
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt(model) }, ...messages],
        temperature: 0.6,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    if (!r.ok) {
      const status = r.status === 429 ? 429 : 502;
      const msg = r.status === 429
        ? "Hill AI is getting too many requests. Please wait a moment and try again."
        : "The AI service returned an error. Please try again.";
      return res.status(status).json({ error: msg });
    }

    const data = await r.json();
    let reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string") {
      return res.status(502).json({ error: "The AI service returned an unexpected response." });
    }
    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!reply) {
      return res.status(502).json({ error: "The AI returned an empty reply. Please try again." });
    }
    return res.status(200).json({ reply });
  } catch (err) {
    if (err && err.name === "AbortError") {
      return res.status(504).json({ error: "The AI took too long to respond. Please try again." });
    }
    return res.status(502).json({ error: "Could not reach the AI service. Please try again." });
  } finally {
    clearTimeout(timer);
  }
    }
