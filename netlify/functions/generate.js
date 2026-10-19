export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { url, rawText, industry, brandVoice, neverSay } = await req.json();
    let contentToAnalyze = rawText || "";

    // 1. Scrape live landing page via Jina (Free, no key needed)
    if (url && url.trim().startsWith("http")) {
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${encodeURIComponent(url.trim())}`, {
          headers: { "Accept": "text/plain" }
        });
        if (jinaRes.ok) {
          const scraped = await jinaRes.text();
          contentToAnalyze = `${scraped.slice(0, 5000)}\n\nUser Context: ${rawText || ""}`;
        }
      } catch (e) {
        console.warn("Jina fetch warning:", e);
      }
    }

    if (!contentToAnalyze.trim()) {
      return new Response(JSON.stringify({ error: "Please provide a landing page URL or paste your ad copy." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY is not set in Netlify Environment Variables." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Call Free Llama 3.3 on Groq
    const prompt = `You are an elite direct-response ad creative director.
Read this product / landing page content:
"""
${contentToAnalyze.slice(0, 5000)}
"""

Settings:
- Industry: ${industry || "E-com"}
- Brand Voice: ${brandVoice || "Direct, high-converting"}
- Forbidden Words: ${neverSay || "none"}

Return ONLY a valid JSON object matching this exact shape:
{
  "data": [
    [
      {"t": 0, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""},
      {"t": 0, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""}
    ],
    [
      {"t": 1, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""},
      {"t": 1, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""}
    ],
    [
      {"t": 2, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""},
      {"t": 2, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""}
    ],
    [
      {"t": 3, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""},
      {"t": 3, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""}
    ],
    [
      {"t": 4, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""},
      {"t": 4, "hook": "...", "cam": "...", "br": "...", "ov": "...", "rv": ""}
    ]
  ]
}

Track Reference:
0: Contrarian (call out industry BS, pattern interrupt)
1: Problem-Agitate (uncomfortable reality, cost of inaction)
2: Us vs Them (old way vs our way)
3: Proof-First (hard numbers, real case studies, no hype)
4: Open Loop (cliffhanger, curious detail)

Fields:
- "cam": camera framing (e.g. Tight selfie angle, Handheld macro).
- "br": visual b-roll direction.
- "ov": short overlay text (max 6 words).
- "rv": leave empty "" unless it makes an aggressive medical/income claim that risks Meta/TikTok ad rejection.`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You output strictly valid JSON matching the user schema. Do not write markdown blocks or introductory text." },
          { role: "user", content: prompt }
        ],
        temperature: 0.6
      })
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      return new Response(JSON.stringify({ error: `Groq error: ${errBody}` }), {
        status: groqRes.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const groqData = await groqRes.json();
    const parsed = JSON.parse(groqData.choices[0].message.content);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Failed generating matrix" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
