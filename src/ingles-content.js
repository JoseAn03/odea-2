/**
 * Costa Neón: LA TORRE DE CONTROL — CONTENIDO puro de la Fase B
 * (v0.56.0) del diseño aprobado (diseno-zona-ingles-odea2.md §6.1,
 * §6.2 y expansión v3 §E.4). Sin DOM, sin estado, sin red: los
 * bancos que alimentan la Fraseología (SRS) y el Laboratorio de Voz.
 *
 *  · SRS_DECKS / SRS_CARDS — 5 decks, 130 tarjetas base escritas
 *    desde SU vida (ANC, el aeropuerto, su historia estrella): cada
 *    tarjeta trae palabra o frase, pronunciación escrita para un
 *    tico, significado en español y una frase ejemplo de su mundo.
 *    Dos tipos: «recon» (reconocer: oír/ver → significado) y «prod»
 *    (producción: ver el significado → DECIR la frase en voz alta y
 *    auto-marcarse) — la producción es la que el screening exige.
 *  · HVPT_CONTRASTS — 8 de los 12 contrastes del inventario del
 *    español (los 4 restantes llegan con la fase E): pares mínimos
 *    con una frase por palabra; el motor (§6.1.2) recombina
 *    contraste × palabras × voces del dispositivo × contexto.
 *  · LAB_PHRASES — las frases del Laboratorio de Voz: su pitch, su
 *    estrella y sus llamadas, con la sílaba acentuada marcada y la
 *    lista de chequeo de la autoevaluación A/B (§6.1.1).
 *  · KEYS_PHRASES — las 5 frases de la prueba del teclado (§6.1.3),
 *    un subconjunto del laboratorio.
 *
 * HONESTIDAD (§6.1): nada de este contenido califica su voz. El
 * HVPT sí tiene respuesta correcta local (identificación); el SRS
 * y el A/B se auto-evalúan con marcas guiadas; la prueba del
 * teclado compara texto dictado contra texto esperado, en local.
 */

export const SRS_DECKS = [
  { id: "datos", name: "Datos y BI", icon: "📊" },
  { id: "entrevista", name: "Entrevista", icon: "🎙️" },
  { id: "aeropuerto", name: "Aeropuerto y clientes", icon: "✈️" },
  { id: "reuniones", name: "Reuniones y oficina", icon: "🗓️" },
  { id: "verbos", name: "Verbos de logro", icon: "🏆" }
];

/* type: "recon" | "prod" — ver el encabezado. */
export const SRS_CARDS = [
  /* ---------------- Datos y BI (40) ---------------- */
  { id: "srs-d01", deck: "datos", type: "recon", term: "dashboard", pron: "DASH-bord", meaning: "tablero (panel de indicadores)", example: "The dashboard shows today's bookings." },
  { id: "srs-d02", deck: "datos", type: "recon", term: "chart", pron: "chart", meaning: "gráfico", example: "This chart compares revenue by month." },
  { id: "srs-d03", deck: "datos", type: "recon", term: "metric", pron: "MÉ-tric", meaning: "métrica", example: "Pick one metric and track it daily." },
  { id: "srs-d04", deck: "datos", type: "recon", term: "filter", pron: "FÍL-ter", meaning: "filtro / filtrar", example: "Filter the report by office." },
  { id: "srs-d05", deck: "datos", type: "recon", term: "report", pron: "ri-PÓRT", meaning: "informe / reporte", example: "I send the report every morning." },
  { id: "srs-d06", deck: "datos", type: "prod", term: "the dashboard shows…", pron: "da DASH-bord shóus", meaning: "el tablero muestra…", example: "The dashboard shows a drop in bookings." },
  { id: "srs-d07", deck: "datos", type: "prod", term: "let me share the report", pron: "let mi shér da ri-PÓRT", meaning: "dejame compartir el informe", example: "Let me share the report with the team." },
  { id: "srs-d08", deck: "datos", type: "recon", term: "reconcile", pron: "RÉ-con-sail", meaning: "conciliar / cuadrar (números)", example: "I reconcile the totals every morning." },
  { id: "srs-d09", deck: "datos", type: "recon", term: "duplicate", pron: "DIÚ-pli-keit", meaning: "duplicado", example: "The system counted one booking twice: a duplicate." },
  { id: "srs-d10", deck: "datos", type: "recon", term: "missing", pron: "MÍ-sing", meaning: "faltante", example: "Three payments are missing from the file." },
  { id: "srs-d11", deck: "datos", type: "recon", term: "match", pron: "mach", meaning: "coincidir / cuadrar", example: "The two lists do not match." },
  { id: "srs-d12", deck: "datos", type: "recon", term: "source", pron: "sors", meaning: "fuente (de datos)", example: "Always check the source before trusting a number." },
  { id: "srs-d13", deck: "datos", type: "recon", term: "check", pron: "chek", meaning: "revisar / verificar", example: "Check the totals before you send them." },
  { id: "srs-d14", deck: "datos", type: "recon", term: "fix", pron: "fics", meaning: "corregir / arreglar", example: "We fixed the formula and the numbers changed." },
  { id: "srs-d15", deck: "datos", type: "recon", term: "trust", pron: "trost", meaning: "confiar", example: "Never trust a number you cannot reconcile." },
  { id: "srs-d16", deck: "datos", type: "prod", term: "never trust a number you cannot reconcile", pron: "NÉ-ver trost a NÁM-ber iu ca-NÓT RÉ-con-sail", meaning: "nunca confiés en un número que no podás conciliar (su frase insignia)", example: "Never trust a number you cannot reconcile." },
  { id: "srs-d17", deck: "datos", type: "recon", term: "revenue", pron: "RÉ-ve-niu", meaning: "ingresos", example: "Revenue grew ten percent this quarter." },
  { id: "srs-d18", deck: "datos", type: "recon", term: "booking", pron: "BÚ-king", meaning: "reserva", example: "We process five hundred bookings a day." },
  { id: "srs-d19", deck: "datos", type: "recon", term: "no-show", pron: "NÓU-shou", meaning: "reserva no presentada", example: "The no-show rate dropped to nine percent." },
  { id: "srs-d20", deck: "datos", type: "recon", term: "fleet", pron: "flit", meaning: "flota", example: "The fleet team moves cars between offices." },
  { id: "srs-d21", deck: "datos", type: "recon", term: "rate", pron: "réit", meaning: "tasa / tarifa", example: "The drop-off rate went up in March." },
  { id: "srs-d22", deck: "datos", type: "recon", term: "forecast", pron: "FÓR-cast", meaning: "pronóstico / proyección", example: "The forecast says demand will rise in December." },
  { id: "srs-d23", deck: "datos", type: "recon", term: "demand", pron: "di-MÁND", meaning: "demanda", example: "Demand is higher on weekends." },
  { id: "srs-d24", deck: "datos", type: "recon", term: "return", pron: "ri-TÉRN", meaning: "devolver / devolución", example: "You can return the car at any office." },
  { id: "srs-d25", deck: "datos", type: "prod", term: "where people drop off", pron: "juér PÍ-pol drop of", meaning: "dónde la gente abandona el proceso", example: "The chart shows where people drop off." },
  { id: "srs-d26", deck: "datos", type: "recon", term: "trend", pron: "trend", meaning: "tendencia", example: "The trend is clear: bookings rise every Friday." },
  { id: "srs-d27", deck: "datos", type: "recon", term: "spike", pron: "spáik", meaning: "pico (subida brusca)", example: "There is a spike in bookings after the holiday." },
  { id: "srs-d28", deck: "datos", type: "recon", term: "drop", pron: "drop", meaning: "caída / caer", example: "A drop in revenue needs an explanation." },
  { id: "srs-d29", deck: "datos", type: "recon", term: "increase", pron: "in-CRÍS", meaning: "aumento / aumentar", example: "Prices increase in high season." },
  { id: "srs-d30", deck: "datos", type: "recon", term: "decrease", pron: "di-CRÍS", meaning: "disminución / disminuir", example: "No-shows decreased after the change." },
  { id: "srs-d31", deck: "datos", type: "recon", term: "compared to", pron: "com-PÉRD tu", meaning: "comparado con", example: "Compared to last week, bookings are up." },
  { id: "srs-d32", deck: "datos", type: "recon", term: "cause", pron: "coz", meaning: "causa", example: "We found the cause of the error." },
  { id: "srs-d33", deck: "datos", type: "recon", term: "impact", pron: "ÍM-pact", meaning: "impacto", example: "The impact was ten hours saved every week." },
  { id: "srs-d34", deck: "datos", type: "recon", term: "due to", pron: "DIÚ tu", meaning: "debido a", example: "The spike is due to the holiday weekend." },
  { id: "srs-d35", deck: "datos", type: "prod", term: "the spike is due to…", pron: "da spáik is DIÚ tu", meaning: "el pico se debe a…", example: "The spike is due to a system error." },
  { id: "srs-d36", deck: "datos", type: "prod", term: "compared to last week…", pron: "com-PÉRD tu last uík", meaning: "comparado con la semana pasada…", example: "Compared to last week, the no-show rate is lower." },
  { id: "srs-d37", deck: "datos", type: "recon", term: "total", pron: "TÓU-tal", meaning: "total", example: "The totals must match at the end of the day." },
  { id: "srs-d38", deck: "datos", type: "recon", term: "average", pron: "Á-ve-rach", meaning: "promedio", example: "The average stay is four days." },
  { id: "srs-d39", deck: "datos", type: "recon", term: "percent", pron: "per-SÉNT", meaning: "por ciento", example: "Fifteen point eight percent of bookings never show up." },
  { id: "srs-d40", deck: "datos", type: "prod", term: "fifteen point eight percent", pron: "fif-TÍN póint éit per-SÉNT", meaning: "quince punto ocho por ciento (números en voz alta)", example: "The no-show rate was fifteen point eight percent." },

  /* ---------------- Entrevista (25) ---------------- */
  { id: "srs-e01", deck: "entrevista", type: "recon", term: "background", pron: "BÁK-graund", meaning: "trayectoria / experiencia previa", example: "My background is in data analysis and customer service." },
  { id: "srs-e02", deck: "entrevista", type: "recon", term: "experience", pron: "ex-PÍ-ri-ens", meaning: "experiencia", example: "I have two years of experience in data." },
  { id: "srs-e03", deck: "entrevista", type: "recon", term: "currently", pron: "CÁ-rrent-li", meaning: "actualmente", example: "Currently, I work at a car rental company." },
  { id: "srs-e04", deck: "entrevista", type: "recon", term: "role", pron: "róul", meaning: "puesto / rol", example: "In my role, I build the daily reports." },
  { id: "srs-e05", deck: "entrevista", type: "recon", term: "team", pron: "tim", meaning: "equipo", example: "My team plans the day with my dashboards." },
  { id: "srs-e06", deck: "entrevista", type: "recon", term: "responsible for", pron: "ris-PÓN-si-bol for", meaning: "responsable de", example: "I am responsible for the daily operation reports." },
  { id: "srs-e07", deck: "entrevista", type: "prod", term: "I am responsible for…", pron: "ai am ris-PÓN-si-bol for", meaning: "soy responsable de…", example: "I am responsible for the daily operation reports." },
  { id: "srs-e08", deck: "entrevista", type: "recon", term: "looking for", pron: "LÚ-king for", meaning: "buscando", example: "I am looking for a role where I can grow in analytics." },
  { id: "srs-e09", deck: "entrevista", type: "recon", term: "next step", pron: "next step", meaning: "siguiente paso", example: "This role is the next step in my career." },
  { id: "srs-e10", deck: "entrevista", type: "recon", term: "weakness", pron: "UÍK-nes", meaning: "debilidad", example: "My weakness was spoken English, and I am training it daily." },
  { id: "srs-e11", deck: "entrevista", type: "recon", term: "challenge", pron: "CHÁ-lench", meaning: "reto / desafío", example: "The biggest challenge was cleaning years of bad data." },
  { id: "srs-e12", deck: "entrevista", type: "recon", term: "pressure", pron: "PRÉ-shur", meaning: "presión", example: "I work well under pressure during high season." },
  { id: "srs-e13", deck: "entrevista", type: "recon", term: "proud", pron: "práud", meaning: "orgulloso", example: "I am proud of the report automation." },
  { id: "srs-e14", deck: "entrevista", type: "recon", term: "learned", pron: "lernd", meaning: "aprendí", example: "I learned that a wrong number is worse than no number." },
  { id: "srs-e15", deck: "entrevista", type: "recon", term: "handle", pron: "JÁN-dol", meaning: "manejar / lidiar con", example: "I handle five hundred bookings of data every day." },
  { id: "srs-e16", deck: "entrevista", type: "prod", term: "Sorry, could you repeat that, please?", pron: "SÓ-rri, cud iu ri-PÍT dat, plis", meaning: "frase de rescate: disculpá, ¿podrías repetir eso, por favor?", example: "Sorry, could you repeat that, please?" },
  { id: "srs-e17", deck: "entrevista", type: "prod", term: "Could you speak a little slower, please?", pron: "cud iu spik a LÍ-tol SLÓU-er, plis", meaning: "frase de rescate: ¿podrías hablar un poco más despacio, por favor?", example: "Could you speak a little slower, please?" },
  { id: "srs-e18", deck: "entrevista", type: "prod", term: "Just to confirm — you are asking about…?", pron: "yost tu con-FÉRM — iu ar ÁS-king a-BÁUT", meaning: "frase de rescate: solo para confirmar — ¿estás preguntando sobre…?", example: "Just to confirm — you are asking about my current role?" },
  { id: "srs-e19", deck: "entrevista", type: "prod", term: "My expected salary is…", pron: "mai ex-PÉC-ted SÁ-la-ri is", meaning: "mi salario esperado es… (decilo corto y sin disculpas)", example: "My expected salary is 750,000 colones gross per month." },
  { id: "srs-e20", deck: "entrevista", type: "prod", term: "I am available to start immediately", pron: "ai am a-VÉI-la-bol tu start i-MÍ-diat-li", meaning: "estoy disponible para empezar de inmediato", example: "I am available to start immediately." },
  { id: "srs-e21", deck: "entrevista", type: "recon", term: "strength", pron: "strength", meaning: "fortaleza", example: "My strength is turning messy data into clear decisions." },
  { id: "srs-e22", deck: "entrevista", type: "recon", term: "Tell me about yourself", pron: "tel mi a-BÁUT ior-SELF", meaning: "la pregunta: contame de vos", example: "Tell me about yourself. — I am a data analyst…" },
  { id: "srs-e23", deck: "entrevista", type: "recon", term: "Where do you see yourself in five years?", pron: "juér du iu si ior-SELF in fáiv iirs", meaning: "la pregunta: ¿dónde te ves en cinco años?", example: "Where do you see yourself in five years? — Growing in marketing analytics." },
  { id: "srs-e24", deck: "entrevista", type: "recon", term: "goal", pron: "góul", meaning: "meta", example: "My goal is to grow into marketing analytics." },
  { id: "srs-e25", deck: "entrevista", type: "prod", term: "Thank you for your time", pron: "zank iu for ior táim", meaning: "frase de cierre: gracias por su tiempo", example: "Thank you for your time. I really enjoyed this conversation." },

  /* ---------------- Aeropuerto y clientes (30) ---------------- */
  { id: "srs-a01", deck: "aeropuerto", type: "recon", term: "reservation", pron: "re-ser-VÉI-shon", meaning: "reserva", example: "Your reservation is under your name." },
  { id: "srs-a02", deck: "aeropuerto", type: "prod", term: "under your name", pron: "ÁN-der ior néim", meaning: "a su nombre", example: "The car is booked under your name." },
  { id: "srs-a03", deck: "aeropuerto", type: "recon", term: "pickup", pron: "PÍK-ap", meaning: "recogida (del carro)", example: "Pickup is at the airport, exit two." },
  { id: "srs-a04", deck: "aeropuerto", type: "recon", term: "drop-off", pron: "DRÓP-of", meaning: "entrega / devolución (del carro)", example: "Drop-off is at the same office, any time." },
  { id: "srs-a05", deck: "aeropuerto", type: "recon", term: "insurance", pron: "in-SHÚ-rans", meaning: "seguro", example: "Full insurance is included in this rate." },
  { id: "srs-a06", deck: "aeropuerto", type: "recon", term: "deposit", pron: "di-PÓ-sit", meaning: "depósito (garantía)", example: "We hold a deposit on your card." },
  { id: "srs-a07", deck: "aeropuerto", type: "recon", term: "license", pron: "LÁI-sens", meaning: "licencia (de conducir)", example: "Can I see your driver's license, please?" },
  { id: "srs-a08", deck: "aeropuerto", type: "recon", term: "mileage", pron: "MÁI-lich", meaning: "kilometraje / millas incluidas", example: "This rate includes unlimited mileage." },
  { id: "srs-a09", deck: "aeropuerto", type: "recon", term: "upgrade", pron: "ap-GRÉID", meaning: "mejora de categoría", example: "We can upgrade you to a bigger car." },
  { id: "srs-a10", deck: "aeropuerto", type: "recon", term: "available", pron: "a-VÉI-la-bol", meaning: "disponible", example: "This model is available today." },
  { id: "srs-a11", deck: "aeropuerto", type: "recon", term: "unfortunately", pron: "an-FÓR-chu-nat-li", meaning: "desafortunadamente", example: "Unfortunately, that model is not available today." },
  { id: "srs-a12", deck: "aeropuerto", type: "recon", term: "instead", pron: "in-STÉD", meaning: "en su lugar / en vez de eso", example: "Instead, I can offer you this SUV." },
  { id: "srs-a13", deck: "aeropuerto", type: "prod", term: "let me check", pron: "let mi chek", meaning: "dejame revisar", example: "Let me check what we have available." },
  { id: "srs-a14", deck: "aeropuerto", type: "prod", term: "one moment, please", pron: "uán MÓU-ment, plis", meaning: "un momento, por favor", example: "One moment, please. I will check the system." },
  { id: "srs-a15", deck: "aeropuerto", type: "prod", term: "anything else?", pron: "É-ni-zing els", meaning: "¿algo más?", example: "Anything else I can help you with?" },
  { id: "srs-a16", deck: "aeropuerto", type: "recon", term: "flight", pron: "fláit", meaning: "vuelo", example: "What time does your flight land?" },
  { id: "srs-a17", deck: "aeropuerto", type: "recon", term: "delayed", pron: "di-LÉID", meaning: "atrasado", example: "My flight was delayed two hours." },
  { id: "srs-a18", deck: "aeropuerto", type: "recon", term: "keys", pron: "kis", meaning: "llaves", example: "Here are your keys. The car is in bay four." },
  { id: "srs-a19", deck: "aeropuerto", type: "recon", term: "full tank", pron: "ful tank", meaning: "tanque lleno", example: "Please return the car with a full tank." },
  { id: "srs-a20", deck: "aeropuerto", type: "recon", term: "damage", pron: "DÁ-mach", meaning: "daño", example: "We note any damage before you leave." },
  { id: "srs-a21", deck: "aeropuerto", type: "recon", term: "contract", pron: "CÓN-tract", meaning: "contrato", example: "Please sign the contract here." },
  { id: "srs-a22", deck: "aeropuerto", type: "recon", term: "credit card", pron: "CRÉ-dit card", meaning: "tarjeta de crédito", example: "We need a credit card for the deposit." },
  { id: "srs-a23", deck: "aeropuerto", type: "recon", term: "passport", pron: "PÁS-port", meaning: "pasaporte", example: "Can I see your passport, please?" },
  { id: "srs-a24", deck: "aeropuerto", type: "recon", term: "How long will you stay?", pron: "jau long uil iu stéi", meaning: "la pregunta: ¿cuánto tiempo se queda?", example: "How long will you stay? — Two weeks." },
  { id: "srs-a25", deck: "aeropuerto", type: "recon", term: "Where are you traveling?", pron: "juér ar iu TRÁ-ve-ling", meaning: "la pregunta: ¿a dónde viaja?", example: "Where are you traveling? — To La Fortuna." },
  { id: "srs-a26", deck: "aeropuerto", type: "recon", term: "child seat", pron: "CHÁILD sit", meaning: "silla para niño", example: "We can add a child seat to your booking." },
  { id: "srs-a27", deck: "aeropuerto", type: "recon", term: "GPS", pron: "yi-pi-ÉS", meaning: "GPS / navegador", example: "GPS is included in this model." },
  { id: "srs-a28", deck: "aeropuerto", type: "recon", term: "late", pron: "léit", meaning: "tarde", example: "If you return the car late, there is an extra charge." },
  { id: "srs-a29", deck: "aeropuerto", type: "recon", term: "charge", pron: "charch", meaning: "cargo / cobro", example: "There is no extra charge for a second driver." },
  { id: "srs-a30", deck: "aeropuerto", type: "prod", term: "Welcome to Costa Rica — have a great trip!", pron: "UÉL-com tu Cósta Rica — jav a gréit trip", meaning: "frase de cierre: bienvenidos a Costa Rica, ¡que tengan un gran viaje!", example: "Welcome to Costa Rica — have a great trip!" },

  /* ---------------- Reuniones y oficina (20) ---------------- */
  { id: "srs-r01", deck: "reuniones", type: "recon", term: "meeting", pron: "MÍ-ting", meaning: "reunión", example: "The meeting is at nine." },
  { id: "srs-r02", deck: "reuniones", type: "recon", term: "agenda", pron: "a-YÉN-da", meaning: "agenda / orden del día", example: "The first point on the agenda is the forecast." },
  { id: "srs-r03", deck: "reuniones", type: "recon", term: "deadline", pron: "DÉD-láin", meaning: "fecha límite", example: "The deadline is Friday at noon." },
  { id: "srs-r04", deck: "reuniones", type: "recon", term: "follow up", pron: "FÓ-lou ap", meaning: "dar seguimiento", example: "I will follow up with the numbers tomorrow." },
  { id: "srs-r05", deck: "reuniones", type: "recon", term: "agree", pron: "a-GRÍ", meaning: "estar de acuerdo", example: "We agree on the new process." },
  { id: "srs-r06", deck: "reuniones", type: "recon", term: "suggest", pron: "sa-YÉST", meaning: "sugerir", example: "I suggest we check the data first." },
  { id: "srs-r07", deck: "reuniones", type: "recon", term: "by Friday", pron: "bai FRÁI-dei", meaning: "para el viernes", example: "I can send it by Friday." },
  { id: "srs-r08", deck: "reuniones", type: "prod", term: "let me confirm", pron: "let mi con-FÉRM", meaning: "dejame confirmar", example: "Let me confirm the numbers and come back to you." },
  { id: "srs-r09", deck: "reuniones", type: "prod", term: "let me confirm and follow up by Friday", pron: "let mi con-FÉRM and FÓ-lou ap bai FRÁI-dei", meaning: "dejame confirmar y dar seguimiento para el viernes (la frase completa)", example: "Let me confirm and follow up by Friday." },
  { id: "srs-r10", deck: "reuniones", type: "recon", term: "schedule", pron: "SKÉ-yul", meaning: "programar / horario", example: "Let me schedule the review for Monday." },
  { id: "srs-r11", deck: "reuniones", type: "recon", term: "reschedule", pron: "ri-SKÉ-yul", meaning: "reprogramar", example: "We need to reschedule the call." },
  { id: "srs-r12", deck: "reuniones", type: "recon", term: "point", pron: "póint", meaning: "punto (idea)", example: "Good point. Let me check the data." },
  { id: "srs-r13", deck: "reuniones", type: "prod", term: "good point", pron: "gud póint", meaning: "buen punto", example: "Good point — the chart was using last month's data." },
  { id: "srs-r14", deck: "reuniones", type: "recon", term: "update", pron: "ap-DÉIT", meaning: "actualización / actualizar", example: "I will update the dashboard today." },
  { id: "srs-r15", deck: "reuniones", type: "recon", term: "share", pron: "shér", meaning: "compartir", example: "Can you share your screen?" },
  { id: "srs-r16", deck: "reuniones", type: "prod", term: "Can you share your screen?", pron: "can iu shér ior scrin", meaning: "la pregunta de reunión: ¿podés compartir tu pantalla?", example: "Can you share your screen, please?" },
  { id: "srs-r17", deck: "reuniones", type: "recon", term: "mute", pron: "miút", meaning: "silencio (micrófono apagado)", example: "You are on mute." },
  { id: "srs-r18", deck: "reuniones", type: "prod", term: "You are on mute", pron: "iu ar on miút", meaning: "estás en silencio (con el micrófono apagado)", example: "Sorry, you are on mute — we cannot hear you." },
  { id: "srs-r19", deck: "reuniones", type: "recon", term: "decision", pron: "di-SÍ-shon", meaning: "decisión", example: "The decision needs data, not opinions." },
  { id: "srs-r20", deck: "reuniones", type: "prod", term: "let's decide with data", pron: "lets di-SÁID uiz DÉI-ta", meaning: "decidamos con datos", example: "Let's decide with data: the chart is clear." },

  /* ---------------- Verbos de logro (15) — producción: su historia estrella ---------------- */
  { id: "srs-v01", deck: "verbos", type: "prod", term: "automated", pron: "Ó-to-méi-ted", meaning: "automaticé", example: "I automated the daily report." },
  { id: "srs-v02", deck: "verbos", type: "prod", term: "saved", pron: "séivd", meaning: "ahorré", example: "The automation saved ten hours a week." },
  { id: "srs-v03", deck: "verbos", type: "prod", term: "improved", pron: "im-PRÚVD", meaning: "mejoré", example: "We improved the report from two hours to fifteen minutes." },
  { id: "srs-v04", deck: "verbos", type: "prod", term: "reduced", pron: "ri-DIÚST", meaning: "reduje", example: "We reduced the no-show rate from fifteen to nine percent." },
  { id: "srs-v05", deck: "verbos", type: "prod", term: "built", pron: "bilt", meaning: "construí", example: "I built the dashboard the team uses every morning." },
  { id: "srs-v06", deck: "verbos", type: "prod", term: "found", pron: "fáund", meaning: "encontré", example: "I found that the report counted bookings twice." },
  { id: "srs-v07", deck: "verbos", type: "prod", term: "fixed", pron: "ficst", meaning: "corregí", example: "I fixed the logic and added a daily check." },
  { id: "srs-v08", deck: "verbos", type: "prod", term: "result", pron: "ri-ZÓLT", meaning: "resultado", example: "The result: numbers the team can trust." },
  { id: "srs-v09", deck: "verbos", type: "prod", term: "cleaned", pron: "clind", meaning: "limpié (datos)", example: "I cleaned the data before building the report." },
  { id: "srs-v10", deck: "verbos", type: "prod", term: "created", pron: "cri-ÉI-ted", meaning: "creé", example: "I created a tool that flags double bookings." },
  { id: "srs-v11", deck: "verbos", type: "prod", term: "measured", pron: "MÉ-shurd", meaning: "medí", example: "We measured the no-show rate for three months." },
  { id: "srs-v12", deck: "verbos", type: "prod", term: "tested", pron: "TÉST-ed", meaning: "probé / testeé", example: "We tested the change with one office first." },
  { id: "srs-v13", deck: "verbos", type: "prod", term: "launched", pron: "loncht", meaning: "lancé / puse en vivo", example: "We launched the new report in October." },
  { id: "srs-v14", deck: "verbos", type: "prod", term: "trained", pron: "tréind", meaning: "capacité / entrené", example: "I trained the team to read the dashboard." },
  { id: "srs-v15", deck: "verbos", type: "prod", term: "solved", pron: "solvd", meaning: "resolví", example: "We solved the double-counting problem." }
];

export const SRS_CARD_BY_ID = new Map(SRS_CARDS.map((c) => [c.id, c]));

/* ------------------------------------------------------------------
 * HVPT (§6.1.2): identificación con respuesta correcta local. Cada
 * par trae las dos palabras y una frase corta por palabra (el
 * contexto «en frase» de la escalera); el contexto «su frase» sale
 * de los ejemplos del SRS cuando la palabra vive ahí. La escalera:
 * nivel 1 = palabra sola, velocidad clara · nivel 2 = en frase,
 * velocidad real · nivel 3 = en frase, voz no usada en la sesión.
 * El contraste «stress» es prosódico: el audio siempre va en frase
 * (el contexto obliga la lectura) y las opciones son los sentidos.
 * ------------------------------------------------------------------ */
export const HVPT_CONTRASTS = [
  { id: "hvpt-ii", name: "ship ≠ sheep", detail: "/iː – ɪ/ · las vocales que cambian palabras", pairs: [
    { a: "ship", sa: "The ship leaves at six.", b: "sheep", sb: "The sheep are in the field." },
    { a: "live", sa: "I live in Heredia.", b: "leave", sb: "I leave work at five." },
    { a: "sit", sa: "Please sit here.", b: "seat", sb: "Your seat is by the window." },
    { a: "fill", sa: "Fill the tank, please.", b: "feel", sb: "I feel good today." },
    { a: "list", sa: "The list is on the dashboard.", b: "least", sb: "At least we checked the data." },
    { a: "pick", sa: "Pick the car you like.", b: "peak", sb: "Peak season starts in December." },
    { a: "rich", sa: "The report is rich in detail.", b: "reach", sb: "We reach the goal this week." },
    { a: "grin", sa: "He gave a big grin.", b: "green", sb: "The light is green now." },
    { a: "slip", sa: "Do not slip on the wet floor.", b: "sleep", sb: "I sleep eight hours." },
    { a: "bit", sa: "Wait a bit, please.", b: "beat", sb: "We beat the deadline." },
    { a: "fit", sa: "The car fits five people.", b: "feet", sb: "My feet hurt after the shift." },
    { a: "lid", sa: "Close the lid.", b: "lead", sb: "She leads the team." },
    { a: "mill", sa: "The old mill is near the river.", b: "meal", sb: "The meal was great." },
    { a: "pitch", sa: "His pitch took one minute.", b: "peach", sb: "The peach is sweet." },
    { a: "sin", sa: "It is a sin to waste data.", b: "seen", sb: "Have you seen the report?" },
    { a: "still", sa: "The office is still open.", b: "steal", sb: "Nobody can steal this car." },
    { a: "tin", sa: "The tin is on the shelf.", b: "teen", sb: "My teen cousin loves games." },
    { a: "whip", sa: "Whip the cream quickly.", b: "weep", sb: "Do not weep over a bad report." },
    { a: "chip", sa: "The chip is in the card.", b: "cheap", sb: "This flight is cheap." },
    { a: "his", sa: "His car is black.", b: "he's", sb: "He's at the airport." }
  ] },
  { id: "hvpt-aeu", name: "cap ≠ cup", detail: "/æ – ʌ/ · la «a» que no es «o»", pairs: [
    { a: "cap", sa: "He wears a cap.", b: "cup", sb: "A cup of coffee, please." },
    { a: "bat", sa: "The bat is in the bag.", b: "but", sb: "I like it, but it is late." },
    { a: "hat", sa: "Your hat is on the chair.", b: "hut", sb: "The hut is by the beach." },
    { a: "bag", sa: "The bag is in the car.", b: "bug", sb: "There is a bug in the report." },
    { a: "cat", sa: "The cat sleeps all day.", b: "cut", sb: "We cut the cost this month." },
    { a: "ran", sa: "He ran to the office.", b: "run", sb: "I run every morning." },
    { a: "sang", sa: "She sang very well.", b: "sung", sb: "He has sung that song before." },
    { a: "back", sa: "The car is back.", b: "buck", sb: "It costs one buck." },
    { a: "lack", sa: "We lack time today.", b: "luck", sb: "Good luck with the interview!" },
    { a: "track", sa: "Track the booking here.", b: "truck", sb: "The truck delivers the cars." },
    { a: "match", sa: "The numbers do not match.", b: "much", sb: "Thank you very much." },
    { a: "bank", sa: "The bank opens at nine.", b: "bunk", sb: "The bunk bed is small." },
    { a: "fan", sa: "The fan is on.", b: "fun", sb: "The game is fun." },
    { a: "map", sa: "The map shows the city.", b: "mud", sb: "The road is full of mud." },
    { a: "rag", sa: "Clean it with a rag.", b: "rug", sb: "The rug is blue." },
    { a: "cab", sa: "The cab is outside.", b: "cub", sb: "The lion cub is small." },
    { a: "hang", sa: "Hang the keys here.", b: "hung", sb: "He hung the picture." },
    { a: "stamp", sa: "The stamp is on the contract.", b: "stump", sb: "The tree stump is old." }
  ] },
  { id: "hvpt-aea", name: "cap ≠ cop", detail: "/æ – ɑ/ · la «a» contra la «o» abierta", pairs: [
    { a: "cap", sa: "He wears a cap.", b: "cop", sb: "The cop is at the corner." },
    { a: "hat", sa: "Your hat is on the chair.", b: "hot", sb: "The coffee is hot." },
    { a: "bag", sa: "The bag is in the car.", b: "bog", sb: "The bog is wet all year." },
    { a: "cat", sa: "The cat sleeps all day.", b: "cot", sb: "The baby sleeps in a cot." },
    { a: "sack", sa: "The sack is heavy.", b: "sock", sb: "One sock is missing." },
    { a: "lack", sa: "We lack time today.", b: "lock", sb: "Lock the car, please." },
    { a: "map", sa: "The map shows the city.", b: "mop", sb: "Clean the floor with the mop." },
    { a: "pat", sa: "Pat the dog gently.", b: "pot", sb: "The pot is on the stove." },
    { a: "tap", sa: "Tap the card here.", b: "top", sb: "The top of the list." },
    { a: "band", sa: "The band plays tonight.", b: "bond", sb: "The bond between them is strong." },
    { a: "add", sa: "Add the two numbers.", b: "odd", sb: "That number looks odd." },
    { a: "black", sa: "My car is black.", b: "block", sb: "The block is near the park." },
    { a: "sang", sa: "She sang very well.", b: "song", sb: "This song is famous." },
    { a: "Dan", sa: "Dan is my friend.", b: "Don", sb: "Don works at the airport." },
    { a: "chat", sa: "We chat every day.", b: "shot", sb: "That was a great shot." }
  ] },
  { id: "hvpt-uu", name: "fool ≠ full", detail: "/uː – ʊ/ · la «u» larga y la corta", pairs: [
    { a: "fool", sa: "Do not be a fool with the data.", b: "full", sb: "The tank is full." },
    { a: "pool", sa: "The pool is at the hotel.", b: "pull", sb: "Pull the door, please." },
    { a: "Luke", sa: "Luke is at the office.", b: "look", sb: "Look at this chart." },
    { a: "food", sa: "The food is ready.", b: "good", sb: "The report looks good." },
    { a: "boot", sa: "The boot is in the car.", b: "book", sb: "The book is on the desk." },
    { a: "cooed", sa: "The baby cooed softly.", b: "could", sb: "Could you repeat that?" },
    { a: "wooed", sa: "He wooed her with flowers.", b: "wood", sb: "The table is made of wood." },
    { a: "who'd", sa: "Who'd believe this number?", b: "hood", sb: "Open the hood of the car." },
    { a: "stew", sa: "The stew is hot.", b: "stood", sb: "He stood by the door." },
    { a: "suit", sa: "He wears a suit.", b: "soot", sb: "The chimney is full of soot." },
    { a: "rude", sa: "That comment was rude.", b: "would", sb: "Would you like coffee?" },
    { a: "true", sa: "The number is true.", b: "took", sb: "The report took two hours." }
  ] },
  { id: "hvpt-eae", name: "bed ≠ bad", detail: "/e – æ/ · la «e» contra la «a»", pairs: [
    { a: "bed", sa: "The bed is in room two.", b: "bad", sb: "The data was bad." },
    { a: "pen", sa: "The pen is on the desk.", b: "pan", sb: "The pan is hot." },
    { a: "men", sa: "The men are at the gate.", b: "man", sb: "The man is waiting." },
    { a: "said", sa: "She said the report is ready.", b: "sad", sb: "He felt sad that day." },
    { a: "head", sa: "My head hurts.", b: "had", sb: "We had a busy day." },
    { a: "ten", sa: "Ten bookings are missing.", b: "tan", sb: "He has a nice tan." },
    { a: "bet", sa: "I bet the flight is late.", b: "bat", sb: "The bat is in the bag." },
    { a: "pet", sa: "The pet is at home.", b: "pat", sb: "Pat the dog gently." },
    { a: "send", sa: "Send the report today.", b: "sand", sb: "The sand is white." },
    { a: "lend", sa: "Lend me your pen.", b: "land", sb: "The plane will land soon." },
    { a: "bend", sa: "Bend the paper here.", b: "band", sb: "The band plays tonight." },
    { a: "dead", sa: "The phone is dead.", b: "dad", sb: "My dad drives a taxi." },
    { a: "guess", sa: "Guess the number.", b: "gas", sb: "The car needs gas." },
    { a: "net", sa: "The net is in the garage.", b: "gnat", sb: "A gnat flew into the office." }
  ] },
  { id: "hvpt-bv", name: "berry ≠ very", detail: "/b – v/ · los labios contra los dientes", pairs: [
    { a: "berry", sa: "The berry is sweet.", b: "very", sb: "Thank you very much." },
    { a: "boat", sa: "The boat is at the lake.", b: "vote", sb: "Vote for the best idea." },
    { a: "best", sa: "This is the best report.", b: "vest", sb: "He wears a vest at work." },
    { a: "ban", sa: "There is a ban on that road.", b: "van", sb: "The van carries ten people." },
    { a: "bat", sa: "The bat is in the bag.", b: "vat", sb: "The vat is full of water." },
    { a: "bow", sa: "Take a bow at the end.", b: "vow", sb: "They made a vow." },
    { a: "curb", sa: "Park by the curb.", b: "curve", sb: "The road has a curve." },
    { a: "marble", sa: "The floor is marble.", b: "marvel", sb: "The dashboard is a marvel." },
    { a: "base", sa: "The base of the chart.", b: "vase", sb: "The vase is on the table." },
    { a: "bent", sa: "The key is bent.", b: "vent", sb: "Open the vent, please." },
    { a: "beer", sa: "The beer is cold.", b: "veer", sb: "The car began to veer." },
    { a: "bolt", sa: "The bolt is loose.", b: "volt", sb: "The battery has twelve volts." }
  ] },
  { id: "hvpt-shch", name: "ship ≠ chip", detail: "/ʃ – tʃ/ · el aire largo contra el golpe", pairs: [
    { a: "ship", sa: "The ship leaves at six.", b: "chip", sb: "The chip is in the card." },
    { a: "sheep", sa: "The sheep are in the field.", b: "cheap", sb: "This flight is cheap." },
    { a: "wash", sa: "Wash the car today.", b: "watch", sb: "Watch the numbers change." },
    { a: "wish", sa: "I wish you good luck.", b: "witch", sb: "The witch is in the story." },
    { a: "share", sa: "Share the report with me.", b: "chair", sb: "The chair is broken." },
    { a: "shoe", sa: "One shoe is missing.", b: "chew", sb: "Chew your food slowly." },
    { a: "cash", sa: "He paid in cash.", b: "catch", sb: "Catch the early flight." },
    { a: "mash", sa: "Mash the potatoes.", b: "match", sb: "The numbers do not match." },
    { a: "dish", sa: "The dish is ready.", b: "ditch", sb: "The car is in the ditch." },
    { a: "shop", sa: "The shop opens at eight.", b: "chop", sb: "Chop the onion finely." },
    { a: "sheet", sa: "The sheet has the totals.", b: "cheat", sb: "Never cheat with data." },
    { a: "mush", sa: "The baby eats mush.", b: "much", sb: "Thank you very much." },
    { a: "shoes", sa: "My shoes are new.", b: "choose", sb: "Choose the best chart." }
  ] },
  { id: "hvpt-stress", name: "REcord ≠ reCORD", detail: "acento de palabra · el acento cambia el significado", stress: true, pairs: [
    { a: "REcord", ma: "el registro (sustantivo)", sa: "The REcord is ready for the audit.", b: "reCORD", mb: "grabar (verbo)", sb: "Please reCORD the call for training." },
    { a: "PREsent", ma: "el regalo / el presente", sa: "This PREsent is for Ian.", b: "preSENT", mb: "presentar (verbo)", sb: "Let me preSENT the report." },
    { a: "INcrease", ma: "el aumento (sustantivo)", sa: "The INcrease was ten percent.", b: "inCREASE", mb: "aumentar (verbo)", sb: "Prices inCREASE in high season." },
    { a: "DEcrease", ma: "la disminución (sustantivo)", sa: "The DEcrease in no-shows is real.", b: "deCREASE", mb: "disminuir (verbo)", sb: "No-shows deCREASE after the change." },
    { a: "IMport", ma: "la importación (sustantivo)", sa: "The IMport arrived late.", b: "imPORT", mb: "importar (verbo)", sb: "We imPORT the parts." },
    { a: "EXport", ma: "la exportación (sustantivo)", sa: "Coffee is a big EXport.", b: "exPORT", mb: "exportar (verbo)", sb: "They exPORT coffee to Europe." },
    { a: "PROject", ma: "el proyecto (sustantivo)", sa: "The PROject starts Monday.", b: "proJECT", mb: "proyectar (verbo)", sb: "We proJECT demand for December." },
    { a: "CONtract", ma: "el contrato (sustantivo)", sa: "Please sign the CONtract here.", b: "conTRACT", mb: "contratar (verbo)", sb: "They conTRACT drivers in December." },
    { a: "OBject", ma: "el objeto (sustantivo)", sa: "The OBject is on the desk.", b: "obJECT", mb: "objetar (verbo)", sb: "I obJECT to that number." },
    { a: "PERmit", ma: "el permiso (sustantivo)", sa: "Your PERmit is ready.", b: "perMIT", mb: "permitir (verbo)", sb: "They perMIT two drivers." },
    { a: "REbel", ma: "el rebelde (sustantivo)", sa: "The REbel led the group.", b: "reBEL", mb: "rebelarse (verbo)", sb: "They reBEL against bad data." },
    { a: "SUSpect", ma: "el sospechoso (sustantivo)", sa: "The SUSpect is at the gate.", b: "susPECT", mb: "sospechar (verbo)", sb: "I susPECT the totals are wrong." },
    { a: "CONduct", ma: "la conducta (sustantivo)", sa: "His CONduct was professional.", b: "conDUCT", mb: "dirigir / realizar (verbo)", sb: "We conDUCT the audit monthly." },
    { a: "PROduce", ma: "los productos frescos (sustantivo)", sa: "The PROduce is fresh today.", b: "proDUCE", mb: "producir (verbo)", sb: "We proDUCE the report daily." }
  ] }
];

export const HVPT_CONTRAST_BY_ID = new Map(HVPT_CONTRASTS.map((c) => [c.id, c]));

/* ------------------------------------------------------------------
 * LABORATORIO DE VOZ (§6.1.1 y §6.1.4): sus frases reales — el
 * pitch, la estrella, las llamadas — con la sílaba acentuada en
 * mayúsculas y la lista de chequeo de la autoevaluación A/B.
 * El shadowing usa estas mismas frases como material rotativo.
 * ------------------------------------------------------------------ */
export const LAB_PHRASES = [
  { id: "lab-01", text: "I automated the daily report.", marked: "I AUtomated the DAIly rePORT.", checks: ["¿El -ED de automated sonó completo (/ɪd/)?", "¿El acento cayó en AU- de automated?", "¿«report» llevó el acento al final?"] },
  { id: "lab-02", text: "It went from two hours to fifteen minutes.", marked: "It went from TWO HOURS to fifTEEN MInutes.", checks: ["¿«two hours» salió pegado, sin pausa?", "¿El acento cayó en -TEEN de fifteen?", "¿La frase tuvo pulso, no sílabas parejas?"] },
  { id: "lab-03", text: "I found that our reports counted bookings twice.", marked: "I FOUND that our rePORTS COUNTed BOOKings TWICE.", checks: ["¿El -ED de counted se oyó?", "¿«bookings» salió con la S final?", "¿El acento de reports cayó al final?"] },
  { id: "lab-04", text: "Never trust a number you cannot reconcile.", marked: "NEver TRUST a NUMber you cannot REconcile.", checks: ["¿El acento de reconcile cayó en RE-?", "¿«trust» salió con la T final clara?", "¿Sonó como frase insignia, segura?"] },
  { id: "lab-05", text: "I am responsible for the daily operation reports.", marked: "I am resPONsible for the DAIly opeRAtion rePORTS.", checks: ["¿El acento cayó en -PON- de responsible?", "¿«for the» salió débil y rápido?", "¿El acento de reports cayó al final?"] },
  { id: "lab-06", text: "Currently, I work with five hundred bookings a day.", marked: "CUrrently, I WORK with FIVE HUNdred BOOKings a DAY.", checks: ["¿El acento cayó en CU- de currently?", "¿«hundred» salió con la D final?", "¿«bookings a day» salió pegado?"] },
  { id: "lab-07", text: "The dashboard shows where people drop off.", marked: "The DASHboard SHOWS where PEOple DROP OFF.", checks: ["¿El acento cayó en DASH- de dashboard?", "¿«drop off» llevó la fuerza en OFF?", "¿La S de shows se oyó?"] },
  { id: "lab-08", text: "Let me share the report with the team.", marked: "LET me SHARE the rePORT with the TEAM.", checks: ["¿«let me» salió pegado y rápido?", "¿El acento de report cayó al final?", "¿«with the» salió débil?"] },
  { id: "lab-09", text: "Your reservation is under your name.", marked: "Your reserVAtion is UNder your NAME.", checks: ["¿El acento cayó en -VA- de reservation?", "¿«under» salió débil, sin peso pleno?", "¿La frase sonó amable, de servicio?"] },
  { id: "lab-10", text: "Let me check what we have available.", marked: "LET me CHECK what we have aVAIlable.", checks: ["¿El acento cayó en -VAI- de available?", "¿«let me check» salió como un solo bloque?", "¿La K final de check se oyó?"] },
  { id: "lab-11", text: "Compared to last week, bookings are up.", marked: "ComPARED to LAST WEEK, BOOKings are UP.", checks: ["¿El acento cayó en -PARED de compared?", "¿«to» salió débil (forma reducida)?", "¿La frase subió y cerró con fuerza en UP?"] },
  { id: "lab-12", text: "The spike is due to the holiday weekend.", marked: "The SPIKE is DUE to the HOliday WEEKend.", checks: ["¿«due to» salió reducido, no palabra por palabra?", "¿El acento cayó en HO- de holiday?", "¿La K final de spike se oyó?"] },
  { id: "lab-13", text: "Thank you for taking the time to speak with me.", marked: "THANK you for TAking the TIME to SPEAK with me.", checks: ["¿La TH de thank salió con la lengua entre los dientes?", "¿«for» salió débil?", "¿Sonó a cierre profesional, sin apuro?"] },
  { id: "lab-14", text: "I am available to start immediately.", marked: "I am aVAIlable to START imMEdiately.", checks: ["¿El acento cayó en -ME- de immediately?", "¿«to» salió débil entre available y start?", "¿Sonó corto y seguro, sin disculpas?"] }
];

export const LAB_PHRASE_BY_ID = new Map(LAB_PHRASES.map((p) => [p.id, p]));

/* La prueba del teclado (§6.1.3): 5 frases del laboratorio. */
export const KEYS_PHRASE_IDS = ["lab-01", "lab-05", "lab-09", "lab-11", "lab-14"];

/* ==================================================================
 * FASE C (v0.57.0): Escucha, dictado y banco de entrevista.
 *
 *  · LISTEN_CATALOG — el catálogo curado de escucha (§6.4 + §E.4):
 *    34 fichas por niveles de velocidad (claro 10 · real 14 ·
 *    rápido 10), cada una con acento, cobertura estimada y si trae
 *    transcripción. Son enlaces externos: el juego NO puede saber
 *    si viste el video (ninguna PWA puede), así que la evidencia de
 *    campaña es el CONTROL LOCAL de 3 preguntas de las fichas que lo
 *    traen (respuestas en el código, sin IA) y en rutinas basta
 *    escuchar + anotar (honor system con registro, §6.4). Las
 *    fichas con `series` comparten presentador: son la escucha
 *    estrecha (narrow listening) de la misión de la Fase 3.
 *  · DICTATION_CLIPS — los textos de referencia del dictado: el
 *    modelo los lee con el TTS del dispositivo a velocidad real y
 *    el % de palabras correctas se calcula EN LOCAL comparando lo
 *    escrito contra el texto (bolsa de palabras). Ese % alimenta
 *    el Tablero de OÍDO (§6.5) y la misión «Dictado a ciegas».
 *  · BANK_QUESTIONS — las 18 tarjetas del banco de entrevista
 *    (§6.3 + §E.4): pregunta con su «qué busca» y la respuesta
 *    modelo QUE YA ES DE JOSÉ (su material real de Envista: pitch,
 *    estrella, brecha, validación) como semilla editable — el
 *    banco guarda SU texto (patrón Libreta), sus intentos con
 *    tiempo y su historial de pasadas. Las que no traen semilla
 *    las escribe él: escribirlas ES parte del aprendizaje
 *    (planificación estratégica, Ellis 2005).
 *  · RESCUE_PHRASES — las frases de rescate del screening (§6.3.3):
 *    pedir repetición es profesional; se entrenan como bloques.
 * ================================================================== */

const check = (q, options, answer) => ({ q, options, answer });

export const LISTEN_CATALOG = [
  /* ---------------- Nivel CLARO (10) ---------------- */
  { id: "esc-c01", title: "VOA Learning English · Let's Learn English", kind: "Serie de lecciones", url: "https://learningenglish.voanews.com/", minutes: 30, accent: "us", speed: "claro", coverage: "fluye", transcript: true, series: "voa",
    desc: "Lecciones graduadas con audio lento y claro y texto completo: el peldaño de entrada del catálogo." },
  { id: "esc-c02", title: "BBC 6 Minute English · episodio de la semana", kind: "Podcast BBC", url: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english", minutes: 6, accent: "uk", speed: "claro", coverage: "fluye", transcript: true, series: "bbc6",
    desc: "Dos presentadores, un tema, seis minutos, con transcripción y vocabulario explicado. Escucha estrecha: la misma voz, muchas veces." },
  { id: "esc-c03", title: "BBC 6 Minute English · otro episodio (misma serie)", kind: "Podcast BBC", url: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english", minutes: 6, accent: "uk", speed: "claro", coverage: "fluye", transcript: true, series: "bbc6",
    desc: "La segunda pasada de la escucha estrecha: mismo presentador, tema nuevo. La familiaridad con UNA voz acelera todo lo demás." },
  { id: "esc-c04", title: "BBC · The English We Speak", kind: "Serie BBC", url: "https://www.bbc.co.uk/learningenglish/english/features/the-english-we-speak", minutes: 3, accent: "uk", speed: "claro", coverage: "fluye", transcript: true, series: "bbc6",
    desc: "Expresiones reales del inglés de todos los días, en cápsulas de 3 minutos con transcripción." },
  { id: "esc-c05", title: "Rachel's English · pronunciación en frases", kind: "Video de pronunciación", url: "https://www.youtube.com/@rachelsenglish", minutes: 10, accent: "us", speed: "claro", coverage: "fluye", transcript: true,
    desc: "Pronunciación estadounidense explicada despacio: linking, reducciones y ritmo, con subtítulos." },
  { id: "esc-c06", title: "Tim Urban (TED) · Inside the mind of a master procrastinator", kind: "Charla TED", url: "https://www.ted.com/talks/tim_urban_inside_the_mind_of_a_master_procrastinator", minutes: 14, accent: "us", speed: "claro", coverage: "fluye", transcript: true,
    desc: "Divertida y clara: el mono de la gratificación instantánea contra el monstruo del pánico. Perfecta para el primer control de comprensión.",
    check: [
      check("¿Qué dos «personajes» pelean en la cabeza del procrastinador, según Tim Urban?", ["El jefe y el empleado", "El tomador de decisiones racional y el mono de la gratificación instantánea", "El niño y el adulto"], 1),
      check("¿Qué es lo único que asusta al mono y lo hace salir corriendo?", ["El calendario", "El monstruo del pánico, cuando la fecha límite está encima", "El jefe enojado"], 1),
      check("¿Cuál es el mensaje final de la charla?", ["Procrastinar no tiene ningún costo", "Todos procrastinamos en algo, y conviene mirar en qué", "Solo los estudiantes procrastinan"], 1)
    ] },
  { id: "esc-c07", title: "Amy Cuddy (TED) · Your body language may shape who you are", kind: "Charla TED", url: "https://www.ted.com/talks/amy_cuddy_your_body_language_may_shape_who_you_are", minutes: 21, accent: "us", speed: "claro", coverage: "fluye", transcript: true,
    desc: "Presencia y lenguaje corporal: material directo para entrevistas, a ritmo claro y con transcripción.",
    check: [
      check("¿De qué trata principalmente la charla?", ["De cómo vestirse para una entrevista", "De cómo el lenguaje corporal afecta cómo nos ven y cómo nos sentimos", "De cómo memorizar respuestas"], 1),
      check("¿Qué son las «poses de poder» (power poses) en la charla?", ["Posturas expansivas y abiertas que asociamos con confianza", "Ejercicios de gimnasio antes de la entrevista", "Gestos para intimidar al entrevistador"], 0),
      check("¿Cuál es su consejo famoso al final?", ["«Fingilo hasta que lo logrés» (fake it till you become it)", "«Nunca mostrés nervios»", "«Hablá más fuerte que todos»"], 0)
    ] },
  { id: "esc-c08", title: "English with Lucy · inglés para entrevistas y trabajo", kind: "Video de inglés laboral", url: "https://www.youtube.com/@EnglishwithLucy", minutes: 12, accent: "uk", speed: "claro", coverage: "fluye", transcript: true,
    desc: "Inglés británico claro, pensado para el trabajo: entrevistas, reuniones y frases profesionales." },
  { id: "esc-c09", title: "Speak English with Vanessa · conversación real", kind: "Video de conversación", url: "https://www.youtube.com/@SpeakEnglishWithVanessa", minutes: 15, accent: "us", speed: "claro", coverage: "fluye", transcript: true,
    desc: "Conversación estadounidense a ritmo amable, con las frases tal como se dicen en la vida real." },
  { id: "esc-c10", title: "VOA Learning English · English in a Minute", kind: "Serie de cápsulas", url: "https://learningenglish.voanews.com/", minutes: 2, accent: "us", speed: "claro", coverage: "fluye", transcript: true, series: "voa",
    desc: "Una expresión por minuto, explicada con ejemplos: el bocado más corto del catálogo." },

  /* ---------------- Nivel REAL (14) ---------------- */
  { id: "esc-r01", title: "Hans Rosling (TED) · The best stats you've ever seen", kind: "Charla TED", url: "https://www.ted.com/talks/hans_rosling_the_best_stats_you_ve_ever_seen", minutes: 19, accent: "otro", speed: "real", coverage: "fluye", transcript: true,
    desc: "EL clásico de los datos en vivo: 200 países, 200 años, ingresos y salud moviéndose. Energía alta, vocabulario accesible.",
    check: [
      check("¿Qué muestra Rosling con su gráfico animado?", ["El precio del petróleo por año", "Cómo cambiaron los ingresos y la esperanza de vida de 200 países en 200 años", "Las ventas de una empresa sueca"], 1),
      check("¿Cuál es su gran punto sobre los datos?", ["Que los datos aburren a todos", "Que con buenos datos el mundo se entiende distinto de lo que creemos", "Que solo los estadísticos deben mirar datos"], 1),
      check("¿Qué objeto usa como puntero y ayuda en el escenario?", ["Un láser de oficina", "Una vara larga de profesor", "Un control remoto"], 1)
    ] },
  { id: "esc-r02", title: "David McCandless (TED) · The beauty of data visualization", kind: "Charla TED", url: "https://www.ted.com/talks/david_mccandless_the_beauty_of_data_visualization", minutes: 18, accent: "uk", speed: "real", coverage: "fluye", transcript: true,
    desc: "Visualización de datos contada por un diseñador-periodista británico: tu oficio, en inglés británico.",
    check: [
      check("¿Cómo llama McCandless a los datos en la charla?", ["«El nuevo petróleo» solamente", "«El nuevo suelo»: un medio fértil para cultivar visualizaciones", "«La nueva moneda»"], 1),
      check("¿Qué hace con cifras enormes, como miles de millones de dólares?", ["Las ignora porque confunden", "Las pone en contexto, comparándolas entre sí", "Las convierte todas a euros"], 1),
      check("¿Cuál es su idea central?", ["Que una buena visualización deja ver patrones que la tabla esconde", "Que los gráficos siempre mienten", "Que el diseño importa más que el dato"], 0)
    ] },
  { id: "esc-r03", title: "Alex The Analyst · Data Analyst Portfolio Project", kind: "Video proyecto (YouTube)", url: "https://www.youtube.com/@AlexTheAnalyst", minutes: 40, accent: "us", speed: "real", coverage: "exige", transcript: true, series: "alex",
    desc: "Su video insignia: un proyecto completo de portafolio de analista, paso a paso. Buscalo por el título en su canal.",
    check: [
      check("¿Qué construye Alex en el video del proyecto de portafolio?", ["Una tienda en línea", "Un proyecto de análisis completo para mostrar en el portafolio (limpieza y exploración de datos)", "Un videojuego de datos"], 1),
      check("¿Qué herramientas aparecen en su flujo de trabajo?", ["SQL, Excel y herramientas de visualización como Tableau/Power BI", "Solo Word y PowerPoint", "Únicamente Python"], 0),
      check("¿Para qué sirve el proyecto, según el video?", ["Para venderlo a una empresa", "Para demostrar habilidades reales al buscar trabajo de analista", "Para un examen universitario"], 1)
    ] },
  { id: "esc-r04", title: "Alex The Analyst · SQL para analistas (misma serie)", kind: "Video tutorial (YouTube)", url: "https://www.youtube.com/@AlexTheAnalyst", minutes: 30, accent: "us", speed: "real", coverage: "exige", transcript: true, series: "alex",
    desc: "Escucha estrecha, segunda voz del mismo presentador: SQL explicado trabajando, a velocidad real." },
  { id: "esc-r05", title: "Alex The Analyst · Excel/Tableau (misma serie)", kind: "Video tutorial (YouTube)", url: "https://www.youtube.com/@AlexTheAnalyst", minutes: 30, accent: "us", speed: "real", coverage: "exige", transcript: true, series: "alex",
    desc: "Tercera pasada con la misma voz: cuando una voz ya «fluye», el oído descansa y la velocidad deja de doler." },
  { id: "esc-r06", title: "Luke Barousse · Cómo ser analista de datos", kind: "Video de carrera (YouTube)", url: "https://www.youtube.com/@LukeBarousse", minutes: 15, accent: "us", speed: "real", coverage: "fluye", transcript: true,
    desc: "Carrera de analista contada con datos por un analista: mercado, salarios y ruta de aprendizaje." },
  { id: "esc-r07", title: "CodeBasics · Business Insights 360 (proyecto Power BI)", kind: "Video proyecto (YouTube)", url: "https://www.youtube.com/@codebasics", minutes: 35, accent: "in", speed: "real", coverage: "exige", transcript: true,
    desc: "Acento indio a velocidad real: el proyecto insignia de Power BI del canal, un tablero de negocio completo para una empresa ficticia de hardware.",
    check: [
      check("¿Qué se construye en el proyecto Business Insights 360?", ["Un sitio web de ventas", "Un tablero (dashboard) de negocio en Power BI con vistas de ventas, finanzas y más", "Una base de datos desde cero en papel"], 1),
      check("¿La empresa del proyecto es…?", ["Una empresa real de la India", "Una empresa ficticia de hardware (AtliQ) creada para el proyecto", "La empresa del presentador"], 1),
      check("¿Para qué presenta el canal este proyecto?", ["Como portafolio: demuestra el trabajo completo de un analista, de datos a decisiones", "Como examen de certificación oficial", "Como publicidad de Power BI"], 0)
    ] },
  { id: "esc-r08", title: "Krish Naik · datos y entrevistas técnicas", kind: "Video técnico (YouTube)", url: "https://www.youtube.com/@krishnaik06", minutes: 25, accent: "in", speed: "real", coverage: "exige", transcript: true,
    desc: "Acento indio técnico: ciencia de datos y preparación de entrevistas, con subtítulos." },
  { id: "esc-r09", title: "Data Stories · podcast de visualización", kind: "Podcast", url: "https://datastori.es/", minutes: 45, accent: "us", speed: "real", coverage: "exige", transcript: false,
    desc: "Conversaciones con gente que vive de contar datos: el podcast clásico de la visualización." },
  { id: "esc-r10", title: "Not So Standard Deviations · podcast de datos", kind: "Podcast", url: "https://www.nssdeviations.com/", minutes: 40, accent: "us", speed: "real", coverage: "exige", transcript: false,
    desc: "Dos estadísticos hablando de datos y de la profesión, con humor y sin guion de curso." },
  { id: "esc-r11", title: "Guy in a Cube · Power BI en serio", kind: "Video técnico (YouTube)", url: "https://www.youtube.com/@GuyInACube", minutes: 12, accent: "us", speed: "real", coverage: "exige", transcript: true,
    desc: "Power BI explicado por dos ingenieros del producto: tu herramienta diaria, en inglés real." },
  { id: "esc-r12", title: "The Data Exchange · podcast de la industria", kind: "Podcast", url: "https://thedataexchange.media/", minutes: 40, accent: "us", speed: "real", coverage: "exige", transcript: false,
    desc: "Entrevistas con líderes de datos e IA: vocabulario de industria a velocidad de conversación." },
  { id: "esc-r13", title: "Madeline Mann · «Tell me about yourself»", kind: "Video de entrevistas (YouTube)", url: "https://www.youtube.com/@SelfMadeMillennial", minutes: 10, accent: "us", speed: "real", coverage: "fluye", transcript: true,
    desc: "La respuesta a la pregunta que abre todo screening, con su fórmula famosa. Escucha con robo útil: va directo a tu banco.",
    check: [
      check("¿Qué estructura recomienda Madeline Mann para «Tell me about yourself»?", ["Pasado, presente y futuro, en orden libre", "Presente, pasado, futuro: dónde estás, qué te trajo, a dónde vas", "Solo hablar del futuro"], 1),
      check("¿Cuánto debería durar la respuesta, según su consejo?", ["Unos 30 segundos exactos", "Alrededor de 1–2 minutos, enfocada en lo relevante para el puesto", "Cinco minutos con toda la historia"], 1),
      check("¿Qué error marca como el más común?", ["Hablar demasiado bajo", "Contar toda la vida desde la infancia en vez de lo relevante para el rol", "Hacer preguntas al final"], 1)
    ] },
  { id: "esc-r14", title: "Linda Raynier · entrevistas y carrera", kind: "Video de entrevistas (YouTube)", url: "https://www.youtube.com/@LindaRaynier", minutes: 12, accent: "us", speed: "real", coverage: "fluye", transcript: true,
    desc: "Consejos de entrevista directos y practicables, a velocidad de conversación real." },

  /* ---------------- Nivel RÁPIDO (10) ---------------- */
  { id: "esc-f01", title: "Wendover Productions · logística y aviación", kind: "Video ensayo (YouTube)", url: "https://www.youtube.com/@Wendoverproductions", minutes: 15, accent: "us", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Narración rápida sobre cómo se mueve el mundo: aerolíneas, envíos, logística. Tu industria, a velocidad nativa plena." },
  { id: "esc-f02", title: "Mark Rober · ingeniería que se disfruta", kind: "Video (YouTube)", url: "https://www.youtube.com/@MarkRober", minutes: 15, accent: "us", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Ingeniería contada rápido y con energía: el oído trabaja, el tema entretiene." },
  { id: "esc-f03", title: "Veritasium · ciencia con acento australiano", kind: "Video (YouTube)", url: "https://www.youtube.com/@veritasium", minutes: 14, accent: "otro", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Otra orilla del inglés: acento australiano, ritmo rápido, temas que atrapan." },
  { id: "esc-f04", title: "Krish Naik · sesión de preguntas en vivo", kind: "Video en vivo (YouTube)", url: "https://www.youtube.com/@krishnaik06", minutes: 30, accent: "in", speed: "rapido", coverage: "exige", transcript: true,
    desc: "El mismo acento indio de la fase real, pero en vivo y sin guion: más rápido y menos limpio. El examen del oído." },
  { id: "esc-f05", title: "CodeBasics · proyecto avanzado de datos", kind: "Video proyecto (YouTube)", url: "https://www.youtube.com/@codebasics", minutes: 30, accent: "in", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Acento indio en modo proyecto largo: vocabulario técnico denso a velocidad real de trabajo." },
  { id: "esc-f06", title: "Ken Jee · carrera en datos, sin vueltas", kind: "Video de carrera (YouTube)", url: "https://www.youtube.com/@KenJee_ds", minutes: 12, accent: "us", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Ciencia de datos y carrera hablados rápido y directo: densidad alta por minuto." },
  { id: "esc-f07", title: "Tina Huang · datos y tecnología", kind: "Video (YouTube)", url: "https://www.youtube.com/@TinaHuang1", minutes: 12, accent: "us", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Datos, IA y carrera a ritmo de creadora: rápido, claro en estructura, exigente en velocidad." },
  { id: "esc-f08", title: "BBC News · segmento de negocios", kind: "Noticias (web)", url: "https://www.bbc.com/news/business", minutes: 5, accent: "uk", speed: "rapido", coverage: "exige", transcript: false,
    desc: "Noticias de negocios en británico de noticiero: la velocidad a la que el mundo cuenta la plata." },
  { id: "esc-f09", title: "The Economist · videos de economía", kind: "Video ensayo (YouTube)", url: "https://www.youtube.com/@TheEconomist", minutes: 10, accent: "uk", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Economía global en británico denso y rápido: el peldaño alto del catálogo." },
  { id: "esc-f10", title: "Wall Street Journal · videos de negocios", kind: "Video (YouTube)", url: "https://www.youtube.com/@WSJ", minutes: 10, accent: "us", speed: "rapido", coverage: "exige", transcript: true,
    desc: "Negocios y mercados en estadounidense de redacción: rápido, preciso, sin pausas de cortesía." }
];

export const LISTEN_BY_ID = new Map(LISTEN_CATALOG.map((m) => [m.id, m]));

/* Los acentos que el hito «Tres acentos» (ingles-h9) vigila. */
export const LISTEN_ACCENTS = {
  us: "EE. UU.", uk: "Británico", "in": "Indio", otro: "Otro"
};

/* ------------------------------------------------------------------
 * DICTADO DE REFERENCIA (§6.4 carril intensivo + §6.5 OÍDO): textos
 * fijos en código que el TTS lee a velocidad real. El % se calcula
 * en local (bolsa de palabras contra el texto) y se registra con
 * `ingles.dictation`: es el número medible de la habilidad OÍDO.
 * dic-05 es el clip largo de la misión «Dictado a ciegas» (~2 min).
 * ------------------------------------------------------------------ */
export const DICTATION_CLIPS = [
  { id: "dic-1", level: 1, title: "La mañana en el aeropuerto",
    text: "Good morning. The first flights arrive at six, and the office opens at five. I check the bookings, print the list, and count the cars. Today we have forty reservations and only thirty eight cars ready." },
  { id: "dic-2", level: 1, title: "El reporte diario",
    text: "Every morning I download the data and build the daily report. Before, the report took two hours by hand. Now an agent prepares the numbers, and I check the totals. If a number does not match, I find the error before the meeting." },
  { id: "dic-3", level: 2, title: "La llamada del cliente",
    text: "Good afternoon, thank you for calling. Your reservation is under your name for Friday at nine. The car is ready at the airport office, and the price includes full insurance and unlimited mileage. Please bring your license and a credit card for the deposit." },
  { id: "dic-4", level: 2, title: "La reunión del lunes",
    text: "In the Monday meeting we review the numbers of the week. Bookings went up twelve percent compared to last month, but the no show rate also increased. The team decided to send a confirmation message the day before each pickup and measure the result for two weeks." },
  { id: "dic-5", level: 3, title: "Dictado a ciegas · el clip largo de referencia",
    text: "Last month I audited the numbers of our operation because something did not feel right. The report said that fifteen percent of our customers never showed up to pick up their cars, and that number was driving big decisions. I compared the report with the source data, line by line, and I found the problem: some reservations were counted twice, once when they were created and once when they were modified. I fixed the logic, added a daily check of the totals, and the real rate came down to nine percent. The lesson stayed with me. A wrong number is worse than no number, because people decide with it. Since that day, I never trust a number I cannot reconcile, and I teach the same rule to everyone who works with my dashboards." },
  { id: "dic-6", level: 3, title: "El hallazgo (tu historia, en dictado)",
    text: "I automated our daily report. It went from two hours to fifteen minutes, and it saved the team more than ten hours every week. The agent downloads the data in the morning, Python cleans it, and the dashboard is ready before the first meeting. My manager asked me how I did it, and I explained every step with the numbers in front of us." }
];

export const DICTATION_BY_ID = new Map(DICTATION_CLIPS.map((c) => [c.id, c]));

/* ------------------------------------------------------------------
 * BANCO DE ENTREVISTA (§6.3 + §E.4): 18 tarjetas. `seed` es la
 * respuesta modelo de José (su material real de noviembre) que la
 * tarjeta muestra hasta que él guarda la suya; sin seed, la escribe
 * él. `target` es el tiempo guía en segundos cuando la tarjeta es
 * de contrarreloj (la estrella: 90 → 70 → 50).
 * ------------------------------------------------------------------ */
export const BANK_QUESTIONS = [
  { id: "bank-01", q: "Tell me about yourself.", hint: "La apertura de todo screening: quién sos, tu caja de herramientas, tu sello (automatización e IA aplicada) y qué buscás. Sin leer, en cerca de un minuto.", target: 60,
    seed: "I am a data analyst at ANC Rent a Car, at Juan Santamaría Airport in Costa Rica. I have worked with data for about two years. I work with Python, SQL, Power BI, Tableau and Excel. My thing is building automations and applied AI agents that save real hours: I turned a two-hour daily report into fifteen minutes. Now I am studying Marketing at university, and I am looking to grow into marketing analytics with a global team." },
  { id: "bank-02", q: "What do you do in your current role?", hint: "Tu día real: las 500+ reservas, los tableros que la operación abre cada mañana y para qué decide con ellos.", target: 60,
    seed: "I am responsible for the daily operation reports. I analyze more than five hundred reservations a day for Alamo, Enterprise and National, and I build the Power BI dashboards the operation uses to plan the day: fleet availability, car movements between offices, returns and bookings." },
  { id: "bank-03", q: "Tell me about a time you improved a process.", hint: "Tu historia estrella en STAR: situación (2 horas manuales), acción (agente + Python/VBA + n8n a Power BI), resultado (15 minutos, 10+ horas por semana). La del contrarreloj: 90 → 70 → 50 s.", target: 90,
    seed: "Our daily operation report took about two hours, done by hand every morning. I built an agent that downloads the data, Python and VBA clean and build it, and n8n runs it automatically into Power BI. The report now takes fifteen minutes. We save more than ten hours a week, and the team works with numbers it can trust." },
  { id: "bank-04", q: "Tell me about a mistake you found — or one you made.", hint: "Tu doble conteo del no-show contado como fortaleza de auditoría: qué encontraste, qué corregiste y la lección («never trust a number you cannot reconcile»).", target: 75,
    seed: "Auditing our no-show numbers, I found the report was counting some reservations twice, so the rate looked worse than it was. I fixed the logic and added a daily totals check. My lesson: never trust a number you cannot reconcile." },
  { id: "bank-05", q: "Why are you looking for a new job?", hint: "En positivo, sin hablar mal de ANC: crecimiento hacia marketing analytics y equipos globales. Una o dos frases.", target: 40,
    seed: "I am grateful for my time at ANC — I learned real operations there. I am looking for growth: I want to move into marketing analytics, work with global teams, and keep building data products. That is also why I am studying Marketing." },
  { id: "bank-06", q: "Why this company? Why marketing analytics?", hint: "El puente: el puesto junta tus dos mundos (datos y el marketing que estudiás) y tu línea de los primeros 30 días (auditar fuentes, documentar definiciones, primer dashboard).", target: 60,
    seed: "This role joins my two worlds: data and marketing. I audit marketing-style data every day — funnels, drop-offs, performance dashboards — and I am studying Marketing at university. In my first thirty days I would audit the data sources, document the definitions, and build the first dashboard, like I did in my current job." },
  { id: "bank-07", q: "What are your salary expectations?", hint: "Validación pura: corta, directa, sin disculpas y sin negociar contra vos mismo. Tu cifra definida: ₡750.000 brutos al mes.", target: 15,
    seed: "My expected salary is 750,000 colones gross per month." },
  { id: "bank-08", q: "When can you start?", hint: "Validación pura: disponibilidad inmediata, dicha en una frase tranquila.", target: 15,
    seed: "I am available to start immediately." },
  { id: "bank-09", q: "What is your greatest weakness?", hint: "La debilidad sin miedo: tu inglés hablado, con la prueba viva de tu plan («…and I am training it daily») — este Center es parte de la respuesta.", target: 60,
    seed: "My spoken English. At my last screening they told me my level was not high enough yet — so now I train it every day: pronunciation, listening at real speed, and interview practice. It is improving fast, because I use English eight hours a day at the airport." },
  { id: "bank-10", q: "What is your greatest strength?", hint: "Tu fortaleza con evidencia: convertir datos desordenados en decisiones, auditando antes de calcular.", target: 45,
    seed: "I turn messy data into decisions. I audit before I calculate: I check totals, duplicates and definitions first, and then I automate what repeats. The result is numbers the team can trust, delivered fast." },
  { id: "bank-11", q: "Why should we hire you?", hint: "El cierre de venta: experiencia real (no solo cursos), automatización con números y la carrera en curso. Tres frases, sin humo.", target: 45,
    seed: "Because I bring real data experience, not just courses: two years analyzing five hundred reservations a day, automations that save ten hours a week, and a marketing degree in progress. I learn fast, and I prove it with work, not words." },
  { id: "bank-12", q: "Can you explain what a JOIN is?", hint: "Inglés técnico simple: qué es, la llave que comparten y un ejemplo con TUS tablas (reservas × oficinas). Sin jerga innecesaria.", target: 60,
    seed: "A JOIN combines two tables using a key they share. For example, I join the reservations table with the offices table on the office code, so each booking shows its office name. The type of join decides what happens with rows that have no match." },
  { id: "bank-13", q: "Tell me about the dashboards you build.", hint: "Tus tableros reales de Power BI y la idea que los ordena: cada tablero nace de una decisión, no del dato que haya.", target: 60,
    seed: "I build Power BI dashboards the operation opens every morning: bookings, fleet availability, no-shows and revenue. Each one starts from a decision — what the team needs to decide today — not from the data we happen to have." },
  { id: "bank-14", q: "How do you make sure your data is correct?", hint: "Tu método de calidad: conciliar totales, duplicados, faltantes y definiciones — con el caso del doble conteo como prueba.", target: 60,
    seed: "I reconcile. I compare the totals between the source and the report, check for duplicates and missing values, and validate the definitions with the team. Once I found our no-show report counting reservations twice — that check is now automatic, every day." },
  { id: "bank-15", q: "Tell me about a challenge or a disagreement at work.", hint: "Escribila vos en STAR: la situación, tu tarea, qué hiciste y el resultado con números. Si hubo desacuerdo, contá cómo lo resolviste con datos, no con volumen." },
  { id: "bank-16", q: "Where do you see yourself in five years?", hint: "Tu dirección real: marketing analytics con equipos globales, liderando productos de datos. Que suene a plan, no a frase de cajón.", target: 45,
    seed: "Working in marketing analytics with a global team, leading data products — dashboards and automations that marketing and operations use to decide. I am building that path now: the degree, the certificates, and projects like this one." },
  { id: "bank-17", q: "What do you know about GA4 and digital measurement?", hint: "Los 4 conceptos en una frase cada uno (evento, conversión, UTM, atribución) y tu plan: la auditoría de datos que ya hacés se transfiere directo.", target: 75,
    seed: "An event is any action we measure — a click, a view, a conversion. A conversion is the event that is worth money, like a lead or a sale. UTMs are tags on links that tell us which campaign brought each visit, and attribution decides which channel gets the credit. I am learning GA4 now, and my data audit experience transfers directly." },
  { id: "bank-18", q: "Do you have any questions for us?", hint: "Tus 3 preguntas de siempre: el equipo y a quién reportás, las herramientas de medición que usan hoy, y cómo se ve el éxito en 6 meses. Decir «no» resta puntos.", target: 45,
    seed: "Yes, three. How is the team structured, and who would I report to? What tools do you use today for measurement and dashboards? And how does success look in this role in the first six months?" }
];

export const BANK_BY_ID = new Map(BANK_QUESTIONS.map((q) => [q.id, q]));

/* Las frases de rescate (§6.3.3): pedir repetición es profesional.
 * Viven también como tarjetas de producción del deck Entrevista. */
export const RESCUE_PHRASES = [
  "Sorry, could you repeat that, please?",
  "Could you speak a little slower, please?",
  "Just to confirm — you are asking about…?"
];

/* Fuentes válidas de la bitácora de errores (§6.3.2). */
export const ERROR_SOURCES = {
  dictogloss: "Dictogloss / dictado",
  simulacro: "Simulacro",
  ab: "Ciclo A/B",
  llamada: "Llamada real",
  manual: "A mano"
};
