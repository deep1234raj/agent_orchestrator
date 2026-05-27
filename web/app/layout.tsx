import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Instrument_Serif } from 'next/font/google';
import { Sidebar } from '@/components/sidebar';
import { QueryProvider } from '@/components/query-provider';
import { Toaster } from '@/components/toaster';
import './globals.css';

/*
 * Fonts.
 *
 * Display: Instrument Serif — distinctive, editorial, sets the tone.
 *          (Picked over Space Grotesk / Inter / etc. which everyone uses.)
 * Body:    Inter — neutral, refined, gets out of the way.
 * Mono:    JetBrains Mono — for IDs, costs, timestamps, code.
 *
 * Loaded via next/font so they're self-hosted, optimal, and zero CLS.
 */

const fontDisplay = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AAOP',
  description: 'AI Agent Orchestration Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <body className="font-sans antialiased">
        <QueryProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1">
              <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
                {children}
              </div>
            </main>
          </div>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
