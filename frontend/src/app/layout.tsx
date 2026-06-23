import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TruthMarket — AI-Powered Subjective Prediction Market on GenLayer',
  description:
    'The first prediction market for subjective and cultural questions. ' +
    'GenLayer AI reads the internet and delivers verdicts — no human arbitrator needed.',
  keywords: ['prediction market', 'GenLayer', 'AI', 'blockchain', 'smart contract'],
  openGraph: {
    title: 'TruthMarket',
    description: 'AI-powered prediction market on GenLayer',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
