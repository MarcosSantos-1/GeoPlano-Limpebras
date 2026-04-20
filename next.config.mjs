import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet 4.x MapContainer chama o ref duas vezes em dev com Strict Mode e dispara
  // "Map container is already initialized" (closure com context sempre null). Corrigido em react-leaflet v5 (requer React 19).
  // https://github.com/PaulLeCam/react-leaflet/issues/1133
  reactStrictMode: false,
  typedRoutes: true,
  turbopack: {
    // Monorepo/pasta pai com outro package-lock: raiz explícita da app Next
    root: __dirname,
  },
};

export default nextConfig;

