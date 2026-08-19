import { isPartialChunk } from '../lib/tokenizer';

const renderChunk = (chunk) => chunk.replace(/\n/g, '↵').replace(/\t/g, '→');

export default function TokenizerStrip({ id, chunks }) {
  if (!chunks.length) return null;
  const partials = chunks.filter((chunk) => isPartialChunk(chunk)).length;
  const note = [
    'These are the tokens in your draft.',
    partials > 0
      ? `${partials} of them render as · because they are byte fragments — several tokens combine to make one character.`
      : null,
    'The "new" number on the reply counts a bit more: the chat wrapper and the system prompt ride along with every turn.',
  ].filter(Boolean).join(' ');

  return (
    <div id={id} className="tokenizer-strip">
      <div className="tokenizer-strip-track">
        {chunks.map((chunk, index) => (
          <span
            key={index}
            className={`tokenizer-chunk${index % 2 ? ' is-alt' : ''}${isPartialChunk(chunk) ? ' is-partial' : ''}`}
            title={isPartialChunk(chunk) ? 'Part of a character — this token is only a fragment of bytes' : undefined}
          >
            {isPartialChunk(chunk) ? '·' : renderChunk(chunk)}
          </span>
        ))}
      </div>
      <p className="tokenizer-strip-note">{note}</p>
    </div>
  );
}
