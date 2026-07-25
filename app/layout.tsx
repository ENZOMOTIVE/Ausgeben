import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Ausgeben — Personal expense tracker";
const description =
  "A private, shared expense tracker for two people in Passau, Germany.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");

  let origin: URL;

  try {
    origin = new URL(`${protocol}://${host}`);
  } catch {
    origin = new URL("https://ausgeben.local");
  }

  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: origin,
    title,
    description,
    applicationName: "Ausgeben",
    alternates: { canonical: origin.toString() },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Ausgeben",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: "/icon.png",
      apple: "/icon.png",
    },
    openGraph: {
      type: "website",
      locale: "en_GB",
      siteName: "Ausgeben",
      title,
      description,
      url: origin.toString(),
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "Ausgeben — Your spending, made clear.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d3f37",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
