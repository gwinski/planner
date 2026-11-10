export const metadata = { title: "400L Planner" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#14171d", color: "#e8eaf0" }}>
        {children}
      </body>
    </html>
  );
}
