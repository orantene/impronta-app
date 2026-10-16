"use server";

/**
 * TUL-1164: example posts for the builder canvas. The example data lives in
 * `posts-feed-demo.ts` (server only) so it stays out of the admin client bundle;
 * the canvas island (`posts-feed-editor-demo.tsx`) asks for the cards here.
 * Static, public example copy: no tenant data is read.
 */
import { demoPostsFeedCards } from "./posts-feed-demo";
import {
  POSTS_FEED_DEMO_PER_TRADE,
  POSTS_FEED_DEMO_TRADES,
  type PostsFeedCard,
  type PostsFeedDemoTrade,
} from "./posts-feed-model";

export async function loadPostsFeedDemoCardsAction(
  trade: string,
  locale: string,
  count: number,
): Promise<PostsFeedCard[]> {
  const safeTrade: PostsFeedDemoTrade = (POSTS_FEED_DEMO_TRADES as readonly string[]).includes(trade)
    ? (trade as PostsFeedDemoTrade)
    : "general";
  const safeCount = Math.max(1, Math.min(POSTS_FEED_DEMO_PER_TRADE, Math.floor(Number(count)) || 1));
  return demoPostsFeedCards(safeTrade, String(locale ?? "en"), safeCount);
}
