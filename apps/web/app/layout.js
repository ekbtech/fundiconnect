import './globals.css';

export const metadata = {
  title: 'FundiConnect',
  description: 'A Kenyan service marketplace for trusted professionals and customers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
