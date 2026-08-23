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

  // Real refraction (backdrop-filter: url(#lg-refract)) renders only in
  // Chromium. CSS.supports cannot tell us that — it is a syntax test that
  // Safari and Firefox also pass — and nothing exposes a composited backdrop
  // to script, so the gate is an engine signature checked three ways:
  //   · parses url() inside a backdrop-filter chain,
  //   · does NOT support -webkit-backdrop-filter (WebKit's own prefix: Safari
  //     has always had it, Blink never shipped it),
  //   · exposes navigator.userAgentData (UA-CH is Chromium-only, and secure
  //     context only — plain-http LAN testing falls back, by design).
  // Every miss lands on the frosted fallback, which is the baseline anyway.
  useEffect(() => {
    const on = typeof CSS !== 'undefined'
      && CSS.supports('backdrop-filter', 'url(#lg-refract)')
      && !CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
      && !!navigator.userAgentData;
    document.documentElement.dataset.refract = on ? 'on' : 'off';
  }, []);

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