import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://creators.almostheard.ca"),
  title: {
    default: "Almost Heard Creators",
    template: "%s · Almost Heard Creators",
  },
  description:
    "Almost Heard Creators helps independent music creators own, organize, share and grow their music catalogues.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
