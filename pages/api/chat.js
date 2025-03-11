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

    // Use gpt-3.5-turbo-instruct which supports logprobs
    const response = await openai.completions.create({
      model: 'gpt-3.5-turbo-instruct',
      prompt: message,
      temperature: 0.7,
      max_tokens: 150,
      logprobs: 5, // Get top 5 token probabilities
    });

    // Extract response text
    const text = response.choices[0].text.trim();
    
    // Extract token probabilities
    const tokenLogprobs = response.choices[0].logprobs;
    const tokenProbabilities = [];
    
    if (tokenLogprobs && tokenLogprobs.tokens) {
      // Create an array of token objects with their probabilities
      for (let i = 0; i < tokenLogprobs.tokens.length; i++) {
        const token = tokenLogprobs.tokens[i];
        const topLogprobs = tokenLogprobs.top_logprobs[i];
        
        tokenProbabilities.push({
          token: token,
          top_logprobs: topLogprobs
        });
      }
    }
    
    return res.status(200).json({
      text: text,
      tokenProbabilities: tokenProbabilities
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
} 