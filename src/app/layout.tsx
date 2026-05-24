import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Inventory",
  description: "Multi-warehouse inventory reservation system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen font-sans antialiased">
        <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <a href="/" className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
            Allo Inventory
          </a>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
