# Token Explorer

An instructive chat application that visually exposes the inner workings of AI language models by revealing token probabilities and alternative responses, offering unprecedented transparency into how AI "thinks" when generating responses.

Inspired by [Scott Hanselman's "AI without the BS, for humans" keynote at NDC London 2025](https://www.youtube.com/watch?v=kYUicaho5k8), this project transforms AI from a mysterious black box into an educational tool that helps users understand the probabilistic nature of language generation.

## Core Innovation

ChatProb makes AI more transparent by visualizing:

1. **Token-level confidence**: Color-coded tokens show exactly how confident the model is about each word choice (green for high confidence, yellow for medium, red for low)
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

## Understanding AI Language Generation

### How Language Models Think

When generating text, GPT-3.5 doesn't simply "know" the right words. Instead, it:

1. Analyzes all previous context (the conversation history)
2. For each position, computes probability scores for thousands of potential tokens
3. Selects tokens based on these probabilities (influenced by temperature setting)
4. Generates multiple possible responses to demonstrate its non-deterministic nature
5. Builds each response one token at a time in this probabilistic manner

### Visualization Components

Our application exposes this process through:

- **Token-level Visualization**: The `Message.js` component renders individual tokens with color-coded backgrounds based on their probability
- **Probability Tooltips**: The `TokenProbabilities.js` component provides detailed insights into alternative choices
- **Response Toggle**: A dedicated UI control with smooth flip animation for switching between alternative responses, complete with a counter showing position in the sequence
- **Color Gradient System**: Background colors dynamically calculated based on token probability
- **Adaptive Positioning**: Smart tooltip placement that adjusts to viewport boundaries

These visualizations help understand:

- When the model is confident versus uncertain
- How context influences word choice probability
- The range of alternatives the model considers viable
- How the same prompt can yield different but equally valid responses
- How seemingly small probability differences can lead to entirely different response paths

## Technical Architecture

### Frontend Components
- **ChatInterface.js**: Main conversation container with message history and input handling, featuring a gradient header for visual hierarchy
- **Message.js**: Renders messages with token probability visualization in a compact, clean format
- **TokenProbabilities.js**: Dynamic tooltip showing alternative token choices

### Backend Integration
- **chat.js API Handler**: Custom endpoint leveraging the OpenAI completions API with logprobs parameter
- **OpenAI SDK**: Integration with gpt-3.5-turbo-instruct model for probability access
- **Probability Processing**: Transformation of complex log probability values into user-friendly visualizations

### Data Flow
1. User messages are sent to the API with conversation context
2. The API returns both the response text and token probability data, along with multiple alternative completions
3. The interface renders this data with interactive visualization and elegant toggle controls
4. Hover interactions reveal deeper probability insights
5. Users can seamlessly switch between alternative responses with a smooth flip animation

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
- Transforms conversation history into appropriate context
- Requests completions with `logprobs: 5` parameter for probability data
- Processes the complex probability response into usable frontend format
- Uses temperature of 0.7 for balanced creativity
- Limits responses to 150 tokens for performance
- Returns structured probability data alongside the response text

## Educational Value

This project serves as:
- A teaching tool for understanding how language models work
- A demonstration of the probabilistic nature of AI text generation
- An example of how to make complex AI concepts accessible through visualization
- A practical implementation of AI transparency principles

## Security and Performance

- Environment-based API key storage
- Throttled API requests
- Smart hover delay (100ms) to prevent excessive tooltip rendering
- Efficient color calculation with RGB interpolation
- Optimized tooltip positioning calculations

## Contributing

Contributions that enhance the educational value or visualization capabilities are particularly welcome. Feel free to submit issues and pull requests.

## License

MIT