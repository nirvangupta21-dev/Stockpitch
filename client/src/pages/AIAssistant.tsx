import { useState, useRef, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { QuoteData } from "./Dashboard";
import {
  Bot, Send, User, AlertTriangle, Sparkles,
  TrendingUp, BarChart2, Globe, RefreshCw, ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  loading?: boolean;
}

interface Props {
  ticker?: string;
  quote?: QuoteData;
}

// ─── Markdown-lite renderer ───────────────────────────────────────────────────
function RenderMessage({ content }: { content: string }) {
  // Split into paragraphs and render basic markdown
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Disclaimer line — special styling
    if (line.includes("⚠️") && line.includes("research and informational")) {
      elements.push(
        <div key={i} className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-yellow-500/8 border border-yellow-500/20 text-xs text-yellow-300/90 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-400" />
          <span>{line.replace("⚠️ ", "")}</span>
        </div>
      );
      i++;
      continue;
    }

    // Headers ## or **text**
    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-sm font-bold text-foreground mt-3 mb-1">{line.replace("## ", "")}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-xs font-bold text-primary mt-2 mb-0.5 uppercase tracking-wider">{line.replace("### ", "")}</h4>);
      i++;
      continue;
    }

    // Bullet points
    if (line.startsWith("- ") || line.startsWith("• ")) {
      const bullets: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("• "))) {
        bullets.push(lines[i].replace(/^[-•] /, ""));
        i++;
      }
      elements.push(
        <ul key={i} className="space-y-1 my-1.5">
          {bullets.map((b, j) => (
            <li key={j} className="flex items-start gap-2 text-sm">
              <span className="text-primary shrink-0 mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: formatInline(b) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatInline(line) }}
        />
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs font-mono text-primary">$1</code>');
}

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: TrendingUp, text: "What makes a strong long thesis for a growth stock?" },
  { icon: BarChart2, text: "Explain EV/EBITDA and when to use it" },
  { icon: Globe, text: "How do tariffs affect supply chains and stock prices?" },
  { icon: Sparkles, text: "How do I structure an investor pitch for a stock?" },
  { icon: BarChart2, text: "What's the difference between DCF and comparables valuation?" },
  { icon: TrendingUp, text: "What signals indicate a stock is overvalued?" },
];

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-1.5 items-center px-1 py-2">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-primary/60"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AIAssistant({ ticker, quote }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Stock context string to send with each message
  const stockContext = quote
    ? `Ticker: ${quote.ticker} | Company: ${quote.name} | Price: $${quote.price.toFixed(2)} | Daily Change: ${quote.changePercent.toFixed(2)}% | Exchange: ${quote.exchange} | Market Cap: ${quote.marketCap ? `$${(quote.marketCap / 1e9).toFixed(2)}B` : "N/A"}`
    : undefined;

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    const loadingMsg: Message = {
      id: "loading",
      role: "assistant",
      content: "",
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await apiRequest("POST", "/api/ai/chat", {
        messages: history,
        ticker,
        context: stockContext,
      }).then(r => r.json());

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.content || "Sorry, I couldn't generate a response. Please try again.",
        timestamp: new Date(),
      };

      setMessages(prev => prev.filter(m => m.id !== "loading").concat(assistantMsg));
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== "loading").concat({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Something went wrong: ${e.message}\n\n⚠️ This is for research and informational purposes only. This does not constitute financial advice. Please conduct your own due diligence and consult a licensed financial advisor before making any investment decisions.`,
        timestamp: new Date(),
      }));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, loading, ticker, stockContext]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[800px] min-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>
              AI Research Assistant
            </h1>
            <p className="text-xs text-muted-foreground">
              Investment analysis · Not financial advice
              {ticker && <span className="ml-2 text-primary font-mono font-semibold">· {ticker}</span>}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            New chat
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {isEmpty ? (
          /* Welcome screen */
          <div className="h-full flex flex-col items-center justify-center gap-6 px-4">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Investment Research Assistant
              </h2>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Ask me about stocks, valuation models, investment theses, market dynamics, or anything finance-related.
                {ticker && <span> I'm aware you're currently viewing <strong className="text-primary">{ticker}</strong>.</span>}
              </p>
              <div className="flex items-center gap-1.5 justify-center text-xs text-yellow-400/80">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Research purposes only · Not financial advice</span>
              </div>
            </div>

            {/* Suggested prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTIONS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.text)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-card border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-snug">{s.text}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary ml-auto shrink-0 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Message list */
          <>
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "user"
                    ? "bg-primary/20 border border-primary/30"
                    : "bg-secondary border border-border/50"
                }`}>
                  {msg.role === "user"
                    ? <User className="w-3.5 h-3.5 text-primary" />
                    : <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                  }
                </div>

                {/* Bubble */}
                <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary/15 border border-primary/25 text-foreground"
                    : "bg-card border border-border/50"
                }`}>
                  {msg.loading ? (
                    <TypingIndicator />
                  ) : msg.role === "user" ? (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <RenderMessage content={msg.content} />
                  )}
                  {!msg.loading && (
                    <p className="text-xs text-muted-foreground/50 mt-1.5 text-right">
                      {msg.timestamp.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 pt-3 border-t border-border/30">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              data-testid="input-ai-message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about valuations, market trends, investment theses…"
              rows={1}
              disabled={loading}
              className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none leading-relaxed disabled:opacity-50"
              style={{ maxHeight: "120px", overflowY: "auto" }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
          </div>
          <button
            data-testid="button-send-message"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground/50 text-center mt-2">
          Press Enter to send · Shift+Enter for new line · For research purposes only
        </p>
      </div>
    </div>
  );
}
