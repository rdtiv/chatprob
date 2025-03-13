import { useState } from 'react'
import Head from 'next/head'
import ChatInterface from '../components/ChatInterface'

export default function Home() {
  return (
    <div>
      <Head>
        <title>ChatProb</title>
        <meta name="description" content="Explore token probabilities and alternative responses" />
        <link rel="icon" href="/favicon.ico" />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.9); }
            50% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </Head>

      <main style={{ padding: '1rem' }}>
        <h1 className="app-title" style={{ margin: '0 0 1rem 0' }}>ChatProb</h1>
        <ChatInterface />
      </main>
    </div>
  )
} 