/**
 * tutor-index.js — el índice local del TUTOR de Jarvis (v0.51.0).
 *
 * Diseño maestro de Jarvis v2, §3.1: DeepSeek no «sabe» las lecciones
 * de José — el JUEGO busca en su material real y el modelo solo explica
 * los extractos que se le pasan. Este módulo es esa búsqueda: pura,
 * determinista y auditable, sobre los 582 textos que el juego ya trae
 * (414 misiones de `src/campaigns.js` — DESPEGUE y Operación
 * Confirmación sumaron las suyas — + 168 diarias de
 * `data/xp-catalog.json`). Se construye
 * EN MEMORIA, en el dispositivo,
 * la primera vez que se abre el Tutor en la sesión: 0 bytes nuevos de
 * red, 0 bytes de guardado (se reconstruye por sesión).
 *
 * Búsqueda por palabras clave (BM25-lite), no vectores: el corpus es
 * chico y conocido, las preguntas nombran los temas con las palabras
 * del propio material, y el índice puede mostrar exactamente qué
 * extractos se enviaron y por qué.
 *
 * REGLA DE ORO: debajo del umbral de fundamentación NO hay extractos —
 * jamás se manda «algo parecido» como si fuera la lección. Sin
 * extractos, la pregunta es extra y va etiquetada por el juego.
 */

/* Palabras vacías del español: no aportan tema y no cuentan para el
   umbral (la pregunta debe compartir TÉRMINOS DE CONTENIDO). */
const STOPWORDS = new Set([
  "que", "como", "para", "una", "uno", "unas", "unos", "del", "las", "los",
  "con", "por", "sin", "sobre", "entre", "cuando", "donde", "cual", "cuales",
  "quien", "esto", "esta", "este", "estos", "estas", "eso", "esa", "ese",
  "hay", "ser", "son", "fue", "han", "has", "hemos", "tener", "tiene",
  "tengo", "hacer", "hace", "hago", "puede", "puedo", "quiero", "quieres",
  "debo", "debes", "cada", "todo", "toda", "todos", "todas", "algo", "nada",
  "muy", "mas", "menos", "bien", "mal", "aun", "todavia", "antes", "despues",
  "entonces", "tambien", "tampoco", "segun", "desde", "hasta", "hacia",
  "contra", "durante", "mediante", "vos", "jose", "jarvis", "explicame",
  "explica", "contame", "cuentame", "dime", "decime", "significa", "quiero",
  "saber", "aprender", "ver", "dar", "dame", "sea", "sean", "era", "eran",
  "mis", "tus", "sus", "nos", "les", "ella", "ellos", "ellas", "usted",
  "esto", "aquello", "aquella", "aquel", "cierto", "cierta", "forma",
  "manera", "cosa", "cosas", "tema", "temas", "pregunta", "preguntas",
  "hoy", "cuanto", "cuanta", "cuantos", "cuantas", "nuevo", "nueva", "nuevos", "nuevas",
]);

/* Siglas de su mundo que SÍ son tema aunque sean cortas (§3.1.1). */
const SHORT_TOKENS = new Set(["sql", "dax", "etl", "kpi", "api", "ia", "cv", "bi"]);

/* Sinónimos del dominio (riesgo §6.5.3: falso «no está» porque la
   pregunta usa la palabra en inglés o una variante). Se normaliza la
   variante a la forma canónica del material. */
const SYNONYMS = new Map([
  ["window", "ventana"],
  ["windows", "ventana"],
  ["joins", "join"],
  ["inner", "join"],
  ["overbooking", "sobreventa"],
]);

/* Stemming ligero de plurales (ventanas→ventana, funciones→funcion):
   la misma regla indexa y busca, así que la consistencia es lo que
   importa; sin esto, el título «Ventanas para comparar» no casaba con
   la pregunta «funciones de ventana». */
function stemToken(token) {
  if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/* Alias de módulo (§3.1.1): si la pregunta nombra una campaña, sus
   documentos reciben boost ×1.5. Frases normalizadas (sin acentos). */
const MODULE_ALIASES = [
  { id: "academia", phrases: ["academia", "google", "coursera", "la ruta", "certificacion", "certificaciones"] },
  { id: "zonaia", phrases: ["zona ia", "agentes", "agente", "agentes de ia"] },
  { id: "sabiduria", phrases: ["sabiduria", "ucr de la mente", "ucr", "la mente"] },
  { id: "brete", phrases: ["brete", "empleo", "vacantes"] },
  { id: "gamer", phrases: ["zona gamer", "gamer", "videojuegos", "mi canal"] },
  { id: "entrevista", phrases: ["entrevista", "screening", "envista", "dexis"] },
  { id: "eventos", phrases: ["decision lab", "sjo decision", "rentadora", "renta de autos", "overbooking"] },
  { id: "garaje", phrases: ["garaje", "accent", "formula x2", "mi carro", "mi moto"] },
  { id: "mundoian", phrases: ["mundo de ian", "ian", "mi hijo"] },
  { id: "diarias", phrases: ["diarias", "diaria", "misiones de hoy", "mi plan"] },
];

const FIELD_WEIGHTS = { title: 3, context: 2, body: 1 };
const MODULE_BOOST = 1.5;
const CHAPTER_BOOST = 2;
/* Umbral de fundamentación (§3.1.1): ≥ 2 términos ESPECÍFICOS
   compartidos (idf ≥ SPECIFIC_IDF), o 1 término raro (idf ≥ HIGH_IDF),
   y puntaje ≥ FLOOR. Sin esto, dos palabras genéricas («fútbol»,
   «cuesta») fundamentaban preguntas ajenas con puntajes de 2–5,
   mientras las preguntas reales de lección puntúan ≥ 5,9 (batería de
   tests/jarvis-tutor.test.js, con la que se calibró el piso). */
export const TUTOR_SCORE_FLOOR = 4.5;
const HIGH_IDF = 3.5;
const SPECIFIC_IDF = 1.2;
const EXTRACT_MAX_CHARS = 700;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function tokenizeTutorText(value) {
  const raw = normalizeText(value).split(/[^a-z0-9]+/);
  const tokens = [];
  for (const piece of raw) {
    if (!piece) continue;
    const mapped = SYNONYMS.get(piece) || piece;
    if (STOPWORDS.has(mapped)) continue;
    if (mapped.length < 3 && !SHORT_TOKENS.has(mapped)) continue;
    tokens.push(SHORT_TOKENS.has(mapped) ? mapped : stemToken(mapped));
  }
  return tokens;
}

function countTokens(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function chapterShort(chapterTitle) {
  /* «02 · Ruta 1 · Google Advanced» → «Ruta 1 · Google Advanced». */
  return String(chapterTitle || "").replace(/^\s*\d+\s*·\s*/, "").trim();
}

function buildDocs(campaigns, dailyCatalog) {
  const docs = [];
  for (const campaign of Object.values(campaigns || {})) {
    if (!campaign || !Array.isArray(campaign.chapters)) continue;
    for (const chapter of campaign.chapters) {
      const short = chapterShort(chapter.title);
      for (const mission of chapter.missions || []) {
        const steps = Array.isArray(mission.steps) ? mission.steps : [];
        docs.push({
          ref: `${campaign.id}/${chapter.id}/${mission.id}`,
          campaignId: campaign.id,
          chapterId: chapter.id,
          moduleLabel: campaign.name,
          label: `${campaign.name} · ${short} · ${mission.title}`,
          title: String(mission.title || ""),
          context: `${campaign.name} ${chapter.title || ""}`,
          body: [mission.brief || "", ...steps, mission.deliverable || ""].join(" "),
          extractText: [mission.title || "", mission.brief || "", ...steps.slice(0, 2), mission.deliverable || ""]
            .filter(Boolean).join(" ").slice(0, EXTRACT_MAX_CHARS),
        });
      }
    }
  }
  const daily = dailyCatalog && typeof dailyCatalog === "object" ? dailyCatalog : {};
  for (const [id, mission] of Object.entries(daily)) {
    if (!mission || typeof mission !== "object") continue;
    docs.push({
      ref: `diarias/${mission.day}/${id}`,
      campaignId: "diarias",
      chapterId: `dia-${mission.day}`,
      moduleLabel: "Diarias",
      label: `Diarias · Día ${mission.day} · ${mission.title || id}`,
      title: String(mission.title || id),
      context: `Diarias Día ${mission.day}`,
      body: [mission.description || "", mission.verification || ""].join(" "),
      extractText: [mission.title || id, mission.description || "", mission.verification || ""]
        .filter(Boolean).join(" ").slice(0, EXTRACT_MAX_CHARS),
    });
  }
  return docs;
}

/**
 * Construye el índice en memoria. `campaigns` es el objeto CAMPAIGNS
 * de src/campaigns.js y `dailyCatalog` el mapa `daily` de
 * data/xp-catalog.json (el catálogo completo también sirve: se lee
 * su clave `daily` si viene el catálogo entero).
 */
export function buildTutorIndex(campaigns, dailyCatalog) {
  const daily = dailyCatalog && dailyCatalog.daily && typeof dailyCatalog.daily === "object"
    ? dailyCatalog.daily
    : dailyCatalog;
  const docs = buildDocs(campaigns, daily);
  const inverted = new Map(); /* token -> Map(docIndex -> {title, context, body}) */
  const df = new Map();
  docs.forEach((doc, index) => {
    doc.fields = {
      title: countTokens(tokenizeTutorText(doc.title)),
      context: countTokens(tokenizeTutorText(doc.context)),
      body: countTokens(tokenizeTutorText(doc.body)),
    };
    const seen = new Set([
      ...doc.fields.title.keys(), ...doc.fields.context.keys(), ...doc.fields.body.keys(),
    ]);
    doc.allTokens = seen;
    for (const token of seen) {
      df.set(token, (df.get(token) || 0) + 1);
      if (!inverted.has(token)) inverted.set(token, new Map());
      inverted.get(token).set(index, {
        title: doc.fields.title.get(token) || 0,
        context: doc.fields.context.get(token) || 0,
        body: doc.fields.body.get(token) || 0,
      });
    }
  });
  return { docs, inverted, df, total: docs.length, byRef: new Map(docs.map((doc) => [doc.ref, doc])) };
}

/* Umbral de «concepto nuevo» para la compuerta del hilo: más alto
   que HIGH_IDF a propósito — verbos genéricos como «cambia» (idf
   ≈3.6) no abren tema; una palabra desconocida en el corpus (df 0,
   idf ≈6.9) o un concepto muy raro (df ≤ 3) sí. */
const THREAD_NEW_TOPIC_IDF = 5.0;

/**
 * ¿La pregunta es un SEGUIMIENTO del hilo (reusar sus extractos) o un
 * tema nuevo? Señal: si la pregunta introduce un concepto nuevo
 * (idf ≥ THREAD_NEW_TOPIC_IDF) que no aparece en NINGÚN documento del
 * hilo, es tema nuevo — «¿qué es el ROAS?» tras hablar de JOINs no
 * hereda los extractos del JOIN. Un seguimiento («¿y un ejemplo con
 * mis datos?», «¿y el LEFT JOIN cómo cambia eso?») no introduce
 * conceptos nuevos y sí reusa (§3.3).
 */
export function threadReusable(index, question, threadRefs) {
  if (!index || !index.byRef || !Array.isArray(threadRefs) || !threadRefs.length) return false;
  const docs = threadRefs.map((ref) => index.byRef.get(ref)).filter(Boolean);
  if (!docs.length) return false;
  const threadTokens = new Set();
  for (const doc of docs) for (const token of doc.allTokens || []) threadTokens.add(token);
  for (const token of new Set(tokenizeTutorText(question))) {
    if (idfOf(index, token) >= THREAD_NEW_TOPIC_IDF && !threadTokens.has(token)) return false;
  }
  return true;
}

function idfOf(index, token) {
  const docFreq = index.df.get(token) || 0;
  return Math.log(1 + (index.total - docFreq + 0.5) / (docFreq + 0.5));
}

/** Módulo nombrado en la pregunta (para el boost) y acotación de
 *  capítulo cuando la identificación es segura («ruta 2», «curso 3»). */
function namedScope(normalizedQuery) {
  let moduleId = null;
  for (const alias of MODULE_ALIASES) {
    if (alias.phrases.some((phrase) => normalizedQuery.includes(phrase))) {
      moduleId = alias.id;
      break;
    }
  }
  let chapter = null;
  const curso = normalizedQuery.match(/curso\s*(\d{1,2})\b/);
  if (curso) chapter = { kind: "curso", n: Number(curso[1]) };
  const ruta = normalizedQuery.match(/ruta\s*(\d{1,2})\b/);
  if (ruta) chapter = { kind: "ruta", n: Number(ruta[1]) };
  const dia = normalizedQuery.match(/dia\s*(\d{1,2})\b/);
  if (dia && (moduleId === "diarias" || moduleId === null)) {
    chapter = { kind: "dia", n: Number(dia[1]) };
    if (moduleId === null) moduleId = "diarias";
  }
  return { moduleId, chapter };
}

function inChapterScope(doc, chapter) {
  if (!chapter) return false;
  if (chapter.kind === "curso") {
    return doc.campaignId === "academia" && new RegExp(`^Curso ${chapter.n}:`).test(doc.title);
  }
  if (chapter.kind === "ruta") {
    return doc.campaignId === "academia" &&
      new RegExp(`Ruta ${chapter.n}(\\s|·|$)`).test(doc.context);
  }
  if (chapter.kind === "dia") {
    return doc.campaignId === "diarias" && doc.chapterId === `dia-${chapter.n}`;
  }
  return false;
}

/**
 * Busca los extractos para una pregunta. Devuelve hasta `limit`
 * resultados `{ ref, label, moduleLabel, campaignId, score, extract }`
 * SOLO si superan el umbral de fundamentación; si no, lista vacía y la
 * pregunta se trata como extra (la decide quien llama, §3.2).
 */
export function searchTutor(index, query, { limit = 4 } = {}) {
  if (!index || !index.docs || !index.docs.length) return [];
  const normalizedQuery = normalizeText(query);
  const terms = [...new Set(tokenizeTutorText(query))];
  if (!terms.length) return [];
  const { moduleId, chapter } = namedScope(normalizedQuery);

  const scores = new Map(); /* docIndex -> { score, matched: Map(token -> idf) } */
  for (const term of terms) {
    const postings = index.inverted.get(term);
    if (!postings) continue;
    const idf = idfOf(index, term);
    for (const [docIndex, tf] of postings) {
      let entry = scores.get(docIndex);
      if (!entry) { entry = { score: 0, matched: new Map() }; scores.set(docIndex, entry); }
      let contribution = 0;
      for (const field of ["title", "context", "body"]) {
        const count = tf[field] || 0;
        if (count > 0) contribution += FIELD_WEIGHTS[field] * (count / (count + 1.2)) * idf;
      }
      entry.score += contribution;
      entry.matched.set(term, idf);
    }
  }

  const results = [];
  for (const [docIndex, entry] of scores) {
    const doc = index.docs[docIndex];
    let score = entry.score;
    if (moduleId && doc.campaignId === moduleId) score *= MODULE_BOOST;
    if (chapter && inChapterScope(doc, chapter)) score *= CHAPTER_BOOST;
    const idfs = [...entry.matched.values()];
    const specificTerms = idfs.filter((idf) => idf >= SPECIFIC_IDF).length;
    const hasRareTerm = idfs.some((idf) => idf >= HIGH_IDF);
    const grounded = (specificTerms >= 2 || (specificTerms >= 1 && hasRareTerm)) && score >= TUTOR_SCORE_FLOOR;
    if (!grounded) continue;
    results.push({
      ref: doc.ref,
      label: doc.label,
      moduleLabel: doc.moduleLabel,
      campaignId: doc.campaignId,
      score,
      extract: doc.extractText,
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(1, limit));
}
