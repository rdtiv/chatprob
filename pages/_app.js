import { useEffect } from 'react'
import '../styles/globals.css'
import Head from 'next/head'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

function MyApp({ Component, pageProps }) {
  // Applied after mount, not on the SSR-rendered body, so the server markup
  // stays plain and the first paint falls back to the system font stack in
  // globals.css until the client takes over.
  useEffect(() => {
    document.body.className = `${GeistSans.variable} ${GeistMono.variable}`
  }, [])

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta key="theme-color-dark" name="theme-color" content="#0c0f17" media="(prefers-color-scheme: dark)" />
        <meta key="theme-color-light" name="theme-color" content="#ffffff" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp 