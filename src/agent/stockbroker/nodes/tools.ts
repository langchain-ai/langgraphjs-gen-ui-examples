import { StockbrokerState, StockbrokerUpdate } from "../types";
import { ChatOpenAI } from "@langchain/openai";
import { typedUi } from "@langchain/langgraph-sdk/react-ui/server";
import type ComponentMap from "../../../agent-uis/index";
import { z } from "zod";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { findToolCall } from "../../find-tool-call";
import { format, subDays } from "date-fns";
import { Price, Snapshot } from "../../types";

async function getNextPageData(url: string) {
  if (!process.env.FINANCIAL_DATASETS_API_KEY) {
    throw new Error("Financial datasets API key not set");
  }

  const options = {
    method: "GET",
    headers: { "X-API-KEY": process.env.FINANCIAL_DATASETS_API_KEY },
  };

  const response = await fetch(url, options);
  if (!response.ok) {
    const status = response.status;
    const statusText = response.statusText;
    throw new Error(
      `Failed to next page data prices.\nURL: ${url}\nStatus: ${status} ${statusText}`,
    );
  }
  return await response.json();
}

async function getPricesForTicker(ticker: string): Promise<{
  oneDayPrices: Price[];
  thirtyDayPrices: Price[];
}> {
  if (!process.env.FINANCIAL_DATASETS_API_KEY) {
    throw new Error("Financial datasets API key not set");
  }

  const options = {
    method: "GET",
    headers: { "X-API-KEY": process.env.FINANCIAL_DATASETS_API_KEY },
  };

  const url = "https://api.financialdatasets.ai/prices";

  // Get snapshot first to determine the latest available data point
  try {
    const snapshotUrl = `https://api.financialdatasets.ai/prices/snapshot?ticker=${ticker}`;
    const snapshotResponse = await fetch(snapshotUrl, options);
    
    if (!snapshotResponse.ok) {
      throw new Error(`Failed to fetch price snapshot for ${ticker}: ${snapshotResponse.status} ${snapshotResponse.statusText}`);
    }
    
    const snapshotData = await snapshotResponse.json();
    const latestDataDate = snapshotData.snapshot?.time 
      ? format(new Date(snapshotData.snapshot.time), "yyyy-MM-dd")
      : format(subDays(new Date(), 1), "yyyy-MM-dd"); // Fallback to yesterday
    
    const oneMonthAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
    
    // Use the latest available data date instead of today's date
    const queryParamsOneDay = new URLSearchParams({
      ticker,
      interval: "minute",
      interval_multiplier: "5",
      start_date: latestDataDate,
      end_date: latestDataDate,
      limit: "5000",
    });

    const queryParamsThirtyDays = new URLSearchParams({
      ticker,
      interval: "minute",
      interval_multiplier: "30",
      start_date: oneMonthAgo,
      end_date: latestDataDate, // Use latest date instead of now
      limit: "5000",
    });

    // Fetch both datasets
    const [resOneDay, resThirtyDays] = await Promise.all([
      fetch(`${url}?${queryParamsOneDay.toString()}`, options),
      fetch(`${url}?${queryParamsThirtyDays.toString()}`, options),
    ]);

    // Handle thirty-day data - this is critical
    if (!resThirtyDays.ok) {
      throw new Error(`Failed to fetch 30-day price data for ${ticker}: ${resThirtyDays.status} ${resThirtyDays.statusText}`);
    }
    
    const thirtyDaysData = await resThirtyDays.json();
    const thirtyDayPrices = thirtyDaysData.prices || [];
    let nextPageUrlThirtyDays = thirtyDaysData.next_page_url;

    // Handle one-day data - allow this to fail gracefully
    let oneDayPrices: Price[] = [];
    if (resOneDay.ok) {
      const oneDayData = await resOneDay.json();
      oneDayPrices = oneDayData.prices || [];
    } else {
      console.warn(`No intraday price data available for ${ticker} on ${latestDataDate}. Using most recent data from 30-day history.`);
      // If one-day data is unavailable, use the most recent day from thirty-day data
      if (thirtyDayPrices.length > 0) {
        const latestDate = format(new Date(thirtyDayPrices[thirtyDayPrices.length - 1].time), "yyyy-MM-dd");
        const latestDayPrices = thirtyDayPrices.filter((price: Price) => 
          format(new Date(price.time), "yyyy-MM-dd") === latestDate
        );
        oneDayPrices = latestDayPrices;
      }
    }

    // Fetch additional pages for thirty-day data if needed
    let iters = 0;
    while (nextPageUrlThirtyDays) {
      if (iters > 10) {
        console.warn("Maximum pagination iterations reached for thirty-day data");
        break;
      }
      try {
        const nextPageData = await getNextPageData(nextPageUrlThirtyDays);
        thirtyDayPrices.push(...nextPageData.prices);
        nextPageUrlThirtyDays = nextPageData.next_page_url;
        iters += 1;
      } catch (e) {
        console.error("Error fetching next page data:", e);
        break;
      }
    }

    return {
      oneDayPrices,
      thirtyDayPrices,
    };
  } catch (error: unknown) {
    console.error("Error in getPricesForTicker:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch prices for ${ticker}: ${errorMessage}`);
  }
}

async function getPriceSnapshotForTicker(ticker: string): Promise<Snapshot> {
  if (!process.env.FINANCIAL_DATASETS_API_KEY) {
    throw new Error("Financial datasets API key not set");
  }

  const options = {
    method: "GET",
    headers: { "X-API-KEY": process.env.FINANCIAL_DATASETS_API_KEY },
  };
  const url = "https://api.financialdatasets.ai/prices/snapshot";

  const queryParams = new URLSearchParams({
    ticker,
  });

  const response = await fetch(`${url}?${queryParams.toString()}`, options);
  if (!response.ok) {
    throw new Error("Failed to fetch price snapshot");
  }

  const { snapshot } = await response.json();
  return snapshot;
}

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

const getStockPriceSchema = z.object({
  ticker: z.string().describe("The ticker symbol of the company"),
});
const getPortfolioSchema = z.object({
  get_portfolio: z.boolean().describe("Should be true."),
});
const buyStockSchema = z.object({
  ticker: z.string().describe("The ticker symbol of the company"),
  quantity: z.number().describe("The quantity of the stock to buy"),
});

const STOCKBROKER_TOOLS = [
  {
    name: "stock-price",
    description: "A tool to get the stock price of a company",
    schema: getStockPriceSchema,
  },
  {
    name: "portfolio",
    description:
      "A tool to get the user's portfolio details. Only call this tool if the user requests their portfolio details.",
    schema: getPortfolioSchema,
  },
  {
    name: "buy-stock",
    description: "A tool to buy a stock",
    schema: buyStockSchema,
  },
];

export async function callTools(
  state: StockbrokerState,
  config: LangGraphRunnableConfig,
): Promise<StockbrokerUpdate> {
  const ui = typedUi<typeof ComponentMap>(config);

  const message = await llm.bindTools(STOCKBROKER_TOOLS).invoke([
    {
      role: "system",
      content:
        "You are a stockbroker agent that uses tools to get the stock price of a company",
    },
    ...state.messages,
  ]);

  const stockbrokerToolCall = message.tool_calls?.find(
    findToolCall("stock-price")<typeof getStockPriceSchema>,
  );
  const portfolioToolCall = message.tool_calls?.find(
    findToolCall("portfolio")<typeof getPortfolioSchema>,
  );
  const buyStockToolCall = message.tool_calls?.find(
    findToolCall("buy-stock")<typeof buyStockSchema>,
  );

  if (stockbrokerToolCall) {
    const prices = await getPricesForTicker(stockbrokerToolCall.args.ticker);
    ui.push(
      {
        name: "stock-price",
        props: { ticker: stockbrokerToolCall.args.ticker, ...prices },
      },
      { message },
    );
  }
  if (portfolioToolCall) {
    ui.push({ name: "portfolio", props: {} }, { message });
  }
  if (buyStockToolCall) {
    const snapshot = await getPriceSnapshotForTicker(
      buyStockToolCall.args.ticker,
    );
    ui.push(
      {
        name: "buy-stock",
        props: {
          toolCallId: buyStockToolCall.id ?? "",
          snapshot,
          quantity: buyStockToolCall.args.quantity,
        },
      },
      { message },
    );
  }

  return {
    messages: [message],
    ui: ui.items,
    timestamp: Date.now(),
  };
}
