import { OpenAI } from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Format messages for the API
    const lastMessage = messages[messages.length - 1];
    const conversationContext = messages
      .slice(0, -1)
      .map(msg => msg.content)
      .join('\n\n');
    
    const prompt = conversationContext
      ? `${conversationContext}\n\n${lastMessage.content}`
      : lastMessage.content;

    // Use gpt-3.5-turbo-instruct which supports logprobs
    const response = await openai.completions.create({
      model: 'gpt-3.5-turbo-instruct',
      prompt: prompt,
      temperature: 0.7,
      max_tokens: 300,
      logprobs: 5, // Get top 5 token probabilities
      n: 2, // Generate 2 alternative completions
    });

    // Extract responses and their probabilities
    const completions = response.choices.map(choice => ({
      text: choice.text.trim(),
      tokenProbabilities: choice.logprobs.tokens.map((token, i) => ({
        token: token,
        top_logprobs: choice.logprobs.top_logprobs[i]
      }))
    }));
    
    return res.status(200).json({
      completions: completions
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
} 