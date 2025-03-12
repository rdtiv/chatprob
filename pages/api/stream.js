import { OpenAIStream } from '../../utils/OpenAIStream';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const { messages } = await req.json();

    // Format messages - lock in previous assistant responses
    const formattedMessages = messages.map(msg => {
      if (msg.role === 'assistant' && msg.completions) {
        // Use the active completion
        return {
          role: 'assistant',
          content: msg.completions[msg.activeIndex || 0].text
        };
      }
      return msg;
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: formattedMessages,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API error' }), 
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const stream = OpenAIStream(response);
    return new Response(stream);

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 