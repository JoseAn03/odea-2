/**
 * sync-config.js — constantes de la sincronización con Google Drive (v0.20.0).
 *
 * El Client ID de OAuth es un identificador PÚBLICO (no es una clave
 * secreta): identifica a la app ante Google. La autorización real la da el
 * usuario al iniciar sesión con su cuenta y consentir el permiso
 * drive.appdata, que SOLO da acceso a la carpeta oculta y privada de esta
 * app dentro de su Drive — nunca a sus documentos.
 */
export const DRIVE_CLIENT_ID = "716958867462-301sagoifqmhjjdd2lf72r0o7ffqlhe3.apps.googleusercontent.com";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const SYNC_FILE_NAME = "odea2-save.json";
export const SYNC_CONFLICT_FILE_NAME = "odea2-save.conflict.json";
export const SYNC_META_KEY = "odea2_sync_v1";
export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
