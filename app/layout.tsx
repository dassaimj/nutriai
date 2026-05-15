export const metadata = { title: "NutriAI", description: "Seu assistente nutricional com IA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
