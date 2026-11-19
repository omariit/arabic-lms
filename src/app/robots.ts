import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://arabic-lms-production.up.railway.app";

/**
 * robots.txt — welcome search engines, block AI crawlers/agents.
 * The platform's content is for its students; we do not allow AI
 * companies to train on or scrape it.
 */
export default function robots(): MetadataRoute.Robots {
  // AI training / scraping bots — blocked
  const aiBots = [
    // OpenAI
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    // Anthropic
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "anthropic-ai",
    // Common Crawl (feeds LLM datasets)
    "CCBot",
    // ByteDance
    "Bytespider",
    // Google AI
    "Google-Extended",
    "Applebot-Extended",
    // Perplexity
    "PerplexityBot",
    "Perplexity-User",
    // Meta
    "FacebookBot",
    "meta-externalagent",
    // Others
    "Amazonbot",
    "Diffbot",
    "ImagesiftBot",
    "Cotoyogi",
    "PanguBot",
    "Kangaroo Bot",
    "cohere-ai",
    "YouBot",
    "MistralAI-User",
    "Meta-ExternalAgent",
  ];

  return {
    rules: [
      // Search engines: full access except private areas
      {
        userAgent: ["Googlebot", "Bingbot", "DuckDuckBot", "YandexBot", "Baiduspider"],
        allow: "/",
        disallow: ["/admin", "/api", "/dashboard", "/lesson", "/exam", "/live"],
      },
      // All other crawlers: same policy
      { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/dashboard", "/lesson", "/exam", "/live"] },
      // AI agents & training crawlers: nothing
      ...aiBots.map((userAgent) => ({ userAgent, disallow: "/" })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
