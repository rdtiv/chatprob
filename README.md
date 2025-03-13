# ChatProb

An instructive chat application that visually exposes the inner workings of AI language models by revealing token probabilities and alternative responses, offering unprecedented transparency into how AI "thinks" when generating responses.

Inspired by [Scott Hanselman's "AI without the BS, for humans" keynote at NDC London 2025](https://www.youtube.com/watch?v=kYUicaho5k8), this project transforms AI from a mysterious black box into an educational tool that helps users understand the probabilistic nature of language generation.

## Core Innovation

ChatProb makes AI more transparent by visualizing:

1. **Token-level confidence**: Color-coded tokens show exactly how confident the model is about each word choice (green for high confidence, yellow for medium, red for low).
2. **Alternative choices**: On hover, users can see the top 5 alternative words the model considered at each position
3. **Alternative responses**: For each prompt, the system generates multiple complete responses with an elegant flip animation to toggle between them, demonstrating the non-deterministic nature of AI
4. **Decision transparency**: Probability percentages reveal the model's certainty in its choices and the viability of alternatives

This approach demystifies AI by letting users literally see the model's "thought process" at work, creating a uniquely educational AI experience.

## Features

- **Interactive Visualization**: Color-coded tokens with probability-based highlighting
- **Hover Insights**: Tooltips showing alternative tokens and their probabilities
- **Alternative Responses**: Toggle between different AI-generated responses for the same prompt
- **Response Counter**: Visual indicator showing which alternative response is being displayed
- **Persistence**: Local storage for conversation history
- **Responsive Design**: Smart positioning of tooltips to prevent screen overflow
- **Error Handling**: Graceful recovery from API failures
- **Clear Visual Language**: Intuitive color scheme representing confidence levels
- **Temporal Context**: Timestamped messages for conversation tracking
- **Streamlined UI**: Clean, minimal interface with subtle visual hierarchy and compact message bubbles
- **Intuitive Message Flow**: Messages are distinguished by position and color without explicit role labels

## Technical Implementation

### Frontend Architecture
- Built with Next.js 13.5.6 and React 18.2.0
- Styled with CSS-in-JS using styled-jsx
- Mobile-first responsive design with iOS-specific optimizations
- Efficient state management using React hooks
- Smart tooltip positioning with viewport boundary detection

### Backend Integration
- OpenAI GPT-3.5 Turbo Instruct model integration
- Token-level probability analysis with logprobs
- Multiple completion generation (n=2) for alternative responses
- Streaming response support
- Environment-based API key management

### Key Components
- **ChatInterface**: Main conversation container with message history and input handling
- **Message**: Renders messages with token probability visualization and flip animation
- **TokenProbabilities**: Dynamic tooltip component with smart positioning
- **API Handlers**: Endpoints for chat and streaming responses

### Mobile Optimizations
- Viewport height adjustments for iOS Safari
- Safe area insets for notched devices
- Touch-optimized hover interactions
- Responsive tooltip positioning
- Optimized animations for mobile performance
- Smart keyboard handling
- iOS-specific viewport fixes

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

## Dependencies

```json
{
  "dependencies": {
    "@next/env": "13.5.6",
    "@swc/helpers": "0.5.2",
    "next": "13.5.6",
    "openai": "^4.10.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "styled-jsx": "^5.1.6"
  },
  "devDependencies": {
    "eslint": "8.45.0",
    "eslint-config-next": "13.5.6"
  }
}
```

## API Integration

The application uses the OpenAI API with the following features:

### Chat Endpoint (/api/chat)
- Uses GPT-3.5 Turbo Instruct model
- Generates multiple completions (n=2)
- Provides token-level probabilities (logprobs=5)
- Temperature setting of 0.7 for balanced creativity
- Max tokens: 300 per response
- Smart prompt formatting with role markers

### Response Processing
- Token probability visualization using RGB interpolation
- Dynamic color mapping based on confidence levels
- Efficient probability calculations
- Smart token formatting for special characters

## Security and Performance

- Environment-based API key storage
- Throttled API requests
- Smart hover delay (100ms) to prevent excessive tooltip rendering
- Efficient color calculation with RGB interpolation
- Optimized tooltip positioning calculations
- Streaming responses for better UX
- Mobile-optimized interactions

## Contributing

Contributions that enhance the educational value or visualization capabilities are particularly welcome. Feel free to submit issues and pull requests.

## License

MIT
