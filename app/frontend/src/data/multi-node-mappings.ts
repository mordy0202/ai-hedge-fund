export interface MultiNodeDefinition {
  name: string;
  nodes: {
    componentName: string;
    offsetX: number;
    offsetY: number;
  }[];
  edges: {
    source: string;
    target: string;
  }[];
}

const multiNodeDefinition: Record<string, MultiNodeDefinition> = {
  "Value Investors": {
    name: "Value Investors",
    nodes: [
      { componentName: "Stock Tickers", offsetX: 0, offsetY: 0 },
      { componentName: "Ben Graham", offsetX: 400, offsetY: -300 },
      { componentName: "Charlie Munger", offsetX: 400, offsetY: 0 },
      { componentName: "Warren Buffett", offsetX: 400, offsetY: 300 },
      { componentName: "Portfolio Manager", offsetX: 800, offsetY: 0 },
    ],
    edges: [
      { source: "Stock Tickers", target: "Ben Graham" },
      { source: "Stock Tickers", target: "Charlie Munger" },
      { source: "Stock Tickers", target: "Warren Buffett" },
      { source: "Ben Graham", target: "Portfolio Manager" },
      { source: "Charlie Munger", target: "Portfolio Manager" },
      { source: "Warren Buffett", target: "Portfolio Manager" },
    ],
  },
  "Data Wizards": {
    name: "Data Wizards",
    nodes: [
      { componentName: "Stock Tickers", offsetX: 0, offsetY: 0 },
      { componentName: "Technical Analyst", offsetX: 400, offsetY: -550 },
      { componentName: "Fundamentals Analyst", offsetX: 400, offsetY: -200 },
      { componentName: "Sentiment Analyst", offsetX: 400, offsetY: 150 },
      { componentName: "Valuation Analyst", offsetX: 400, offsetY: 500 },
      { componentName: "Portfolio Manager", offsetX: 800, offsetY: 0 },
    ],
    edges: [
      { source: "Stock Tickers", target: "Technical Analyst" },
      { source: "Stock Tickers", target: "Fundamentals Analyst" },
      { source: "Stock Tickers", target: "Sentiment Analyst" },
      { source: "Stock Tickers", target: "Valuation Analyst" },
      { source: "Technical Analyst", target: "Portfolio Manager" },
      { source: "Fundamentals Analyst", target: "Portfolio Manager" },
      { source: "Sentiment Analyst", target: "Portfolio Manager" },
      { source: "Valuation Analyst", target: "Portfolio Manager" },

    ],
  },
};

export function getMultiNodeDefinition(name: string): MultiNodeDefinition | null {
  return multiNodeDefinition[name] || null;
}

export function isMultiNodeComponent(componentName: string): boolean {
  return componentName in multiNodeDefinition;
} 