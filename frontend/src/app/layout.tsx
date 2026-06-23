import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TruthMarket — Sàn Dự Đoán Sự Kiện Chủ Quan trên GenLayer',
  description:
    'Prediction market đầu tiên cho câu hỏi định tính/văn hóa-xã hội. ' +
    'AI tự đọc internet và đưa ra phán quyết — không cần trọng tài con người.',
  keywords: ['prediction market', 'GenLayer', 'AI', 'blockchain', 'smart contract'],
  openGraph: {
    title: 'TruthMarket',
    description: 'AI-powered prediction market trên GenLayer',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        {children}
      </body>
    </html>
  );
}
