import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clerk key-prop warning repro",
  description:
    "Minimal reproduction of the React key warning logged by ClerkProvider when a large prop crosses the RSC boundary",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* This layout is a Server Component, so the RSC build of ClerkProvider
            is used and every prop below is serialized across the RSC boundary.

            `localization={ptBR}` is what triggers the warning: it is a large
            object, and the resulting flight payload puts ClerkProvider's
            children in a separate chunk. Swap it for a small object
            (e.g. {{ signIn: { start: { title: "Hi" } } }}) and the console is
            clean. See README.md for the full matrix. */}
        <ClerkProvider dynamic localization={ptBR}>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
