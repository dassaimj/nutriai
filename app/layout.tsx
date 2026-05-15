export const metadata = { title: "NutriAI", description: "Seu assistente nutricional com IA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}