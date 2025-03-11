# ChatProb 

An instructive chat application that not only provides AI responses but also exposes token probabilities from the language model, offering unique insights into the model's decision-making process.

Inspired by [Scott Hanselman's "AI without the BS, for humans" keynote at NDC London 2025](https://www.youtube.com/watch?v=kYUicaho5k8), this project aims to demystify AI by making language model internals transparent and understandable. By exposing the probability-based decision making process, we follow Hanselman's vision of making AI more approachable and less mystifying for everyday developers and users.

## Features

- Real-time chat interface with GPT-3.5 Turbo
- Token probability visualization for model responses
- Context-aware conversations with message history support
- Error handling and API failure recovery
- Rate limiting and request validation

## Understanding Token Probabilities

### How Language Models Work
The GPT-3.5 model processes text as a sequence of tokens - small units of text that could be words, parts of words, or punctuation. For each position in the sequence, the model:
1. Considers all possible next tokens
2. Assigns probabilities to each possibility
3. Selects the most appropriate token based on these probabilities and temperature setting

### Token Probability Features
Our application exposes these probabilities, showing:
- Top 5 most likely tokens at each position
- Probability scores for each token choice
- Insight into model's decision-making process
- Alternative paths the response could have taken

This transparency helps understand:
- Model confidence in its responses
- Alternative word choices considered
- Context interpretation by the model
- Impact of temperature settings (0.7) on token selection

## Technical Stack

### Backend
- Node.js
- Next.js API Routes
- OpenAI API (gpt-3.5-turbo-instruct model)

### Frontend
- Next.js
- React

### API Integration
- OpenAI Node.js SDK
- Environment-based configuration for API keys

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file with your OpenAI API key:
```bash
OPENAI_API_KEY=your_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

## API Details

The application uses a custom API endpoint (`/api/chat`) that:
- Accepts POST requests with message history
- Processes conversations with context
- Returns both the AI response and token probabilities
- Uses temperature of 0.7 for balanced creativity
- Limits responses to 150 tokens
- Returns top 5 probability scores per token

## Security

- API key stored in environment variables
- Request method validation
- Error handling and sanitization
- No client-side exposure of API keys

## Contributing

Feel free to submit issues and pull requests.

## License

MIT
