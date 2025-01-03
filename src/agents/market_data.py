
from langchain_openai.chat_models import ChatOpenAI

from agents.state import AgentState
from tools.api import search_line_items, get_insider_trades, get_market_cap


llm = ChatOpenAI(model="gpt-4o")

def market_data_agent(state: AgentState):
    """Responsible for gathering and preprocessing market data"""
    messages = state["messages"]
    data = state["data"]
    start_date = data["start_date"]
    end_date = data["end_date"]

    # Get the insider trades
    insider_trades = get_insider_trades(
        ticker=data["ticker"], 
        end_date=end_date,
        limit=5,
    )

    # Get the market cap
    market_cap = get_market_cap(
        ticker=data["ticker"],
    )

    # Get the line_items
    financial_line_items = search_line_items(
        ticker=data["ticker"], 
        line_items=["free_cash_flow", "net_income", "depreciation_and_amortization", "capital_expenditure", "working_capital"],
        period='ttm',
        limit=2,
    )

    return {
        "messages": messages,
        "data": {
            **data, 
            "start_date": start_date, 
            "end_date": end_date,
            "insider_trades": insider_trades,
            "market_cap": market_cap,
            "financial_line_items": financial_line_items,
        }
    }