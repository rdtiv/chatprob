import { OpenAI } from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
      temperature: 0.7,
      max_tokens: 150,
      logprobs: true,
      top_logprobs: 5,
    });

    // Extract token probabilities
    const tokenProbabilities = response.choices[0].logprobs?.content || [];
    
    return res.status(200).json({
      text: response.choices[0].message.content,
      tokenProbabilities: tokenProbabilities
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
} 