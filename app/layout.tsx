import type { Metadata } from "next";
import "./globals.css";
import { ThemeWrapper } from "@/components/ThemeWrapper";

export const metadata: Metadata = {
  title: "GeoPlano - Plano de Trabalho",
  description:
    "Visualize o Plano de Trabalho em um Mapa Interativo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const savedTheme = localStorage.getItem('theme');
                  if (savedTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-sA+e2atLYB2gMl30n8y9LgbNf048IIBmQUJyAA8R+yo="
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <ThemeWrapper>{children}</ThemeWrapper>
      </body>
    </html>
  );
}

