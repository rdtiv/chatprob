import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
      </Head>
      <body>
        {/* Displacement map for the Liquid Glass refraction. Consumed by
            `backdrop-filter: url(#lg-refract)` inside an @supports gate in
            styles/glass.css — WP3 turns it on for the token popover/sheet and
            the sampling panel. Lives in _document so it is in the DOM before
            first paint on every route. */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <filter
            id="lg-refract"
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="blurred"
              scale="24"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
} 