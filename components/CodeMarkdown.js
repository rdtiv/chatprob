import { markdownBlocks } from '../lib/codeMarkdown';

function Inline({ text }) {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

export default function CodeMarkdown({ markdown }) {
  const blocks = markdownBlocks(markdown);
  return (
    <div className="code-markdown">
      {blocks.map((block, index) => {
        if (block.type === 'h') {
          return <h3 key={index}><Inline text={block.text} /></h3>;
        }
        if (block.type === 'ul') {
          return (
            <ul key={index}>
              {block.items.map((item) => <li key={item}><Inline text={item} /></li>)}
            </ul>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={index} className="code-table-wrap">
              <table>
                <thead>
                  <tr>
                    {block.header.map((cell) => <th key={cell}>{cell}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {block.header.map((cell, cellIndex) => (
                        <td key={cell}>{row[cellIndex] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}><Inline text={block.text} /></p>;
      })}
    </div>
  );
}
