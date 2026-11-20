/**
 * jarvis-config.js — la ÚNICA constante con la dirección del Worker de
 * Jarvis (Cloudflare). La clave de DeepSeek vive SOLO como secreto en el
 * Worker; el juego jamás la conoce. Si esta URL queda vacía, Jarvis dice
 * que todavía no está conectado y el juego sigue completo sin él.
 */
export const JARVIS_WORKER_URL = "https://jarvis-odea2.chomita0317.workers.dev";
