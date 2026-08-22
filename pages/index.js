import Head from 'next/head'
import ChatInterface from '../components/ChatInterface'

export default function Home() {
  return (
    <div>
      <Head>
        <title>ChatProb</title>
        <meta name="description" content="Explore token probabilities and alternative responses" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
      </Head>

      <main>
        <ChatInterface />
      </main>
    </div>
  )
} 