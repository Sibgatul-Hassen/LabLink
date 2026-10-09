import { useEffect, useState } from "react";

const QUOTES = [
  {
    text: "Alone we can do so little; together we can do so much.",
    author: "Helen Keller",
    note: "Why a class's leftovers stay in the department pool.",
  },
  {
    text: "Efficiency is doing things right; effectiveness is doing the right things.",
    author: "Peter Drucker",
    note: "Why LabLink shares first and buys last.",
  },
  {
    text: "The best way to predict the future is to invent it.",
    author: "Alan Kay",
    note: "Why every student deserves the parts to build with.",
  },
];

const INTERVAL_MS = 6000;

export default function QuoteCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % QUOTES.length), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused, index]);

  const quote = QUOTES[index];

  return (
    <figure
      className="relative mx-auto max-w-3xl text-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <svg viewBox="0 0 48 48" className="mx-auto h-10 w-10 text-brand-300/70" fill="currentColor" aria-hidden="true">
        <path d="M18 10C10 13 6 19 6 27v11h14V24h-7c0-5 2-8 7-10l-2-4zm22 0c-8 3-12 9-12 17v11h14V24h-7c0-5 2-8 7-10l-2-4z" />
      </svg>

      <div className="relative mt-4 min-h-[9.5rem] sm:min-h-[8rem]" aria-live="polite">
        <div key={index} className="quote-in">
          <blockquote className="font-display text-2xl font-medium leading-snug text-white sm:text-3xl">
            “{quote.text}”
          </blockquote>
          <figcaption className="mt-4 text-sm">
            <span className="font-semibold text-brand-200">— {quote.author}</span>
            <span className="mt-1 block text-slate-400">{quote.note}</span>
          </figcaption>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {QUOTES.map((q, i) => (
          <button
            key={q.author}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show quote by ${q.author}`}
            aria-current={i === index}
            className={`relative h-1.5 overflow-hidden rounded-full bg-white/15 transition-all duration-500 ${i === index ? "w-10" : "w-4 hover:bg-white/30"}`}
          >
            {i === index && (
              <span
                key={`${index}-${paused}`}
                className="quote-progress absolute inset-y-0 left-0 bg-brand-300"
                style={{ animationDuration: `${INTERVAL_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
              />
            )}
          </button>
        ))}
      </div>
    </figure>
  );
}
