import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMarkdownProps = {
  content: string;
};

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <div className="chat-markdown text-sm leading-relaxed text-slate-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
