// Sustituto de @capacitor/core cuando el paquete no está instalado (pruebas locales en navegador).
export const Capacitor = { isNativePlatform: () => false };
export const registerPlugin = () => ({});
