import { useState } from 'react'
import Head from 'next/head'
import ChatInterface from '../components/ChatInterface'

export default function Home() {
  return (
    <div>
      <Head>
        <title>ChatProb - OpenAI Chat with Token Probabilities</title>
        <meta name="description" content="Chat with OpenAI and see token probabilities" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="app-title">ChatProb</h1>
        <p className="app-subtitle">Chat with OpenAI and see token probabilities</p>
        <ChatInterface />
      </main>
    </div>
  )
} 