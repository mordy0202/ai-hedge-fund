from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import questionary

import matplotlib.pyplot as plt
import pandas as pd
from colorama import Fore, Style, init

from utils.analysts import ANALYST_ORDER
from main import run_hedge_fund
from tools.api import (
    get_price_data,
    get_prices,
    get_financial_metrics,
    get_insider_trades,
    search_line_items,
)
from utils.display import print_backtest_results, format_backtest_row

init(autoreset=True)


class Backtester:
    def __init__(self, agent, tickers: list[str], start_date, end_date, initial_capital, selected_analysts=None):
        self.agent = agent
        self.tickers = tickers
        self.start_date = start_date
        self.end_date = end_date
        self.initial_capital = initial_capital
        self.selected_analysts = selected_analysts
        self.portfolio = {
            "cash": initial_capital,
            "positions": {ticker: 0 for ticker in tickers}
        }
        self.portfolio_values = []

    def prefetch_data(self):
        """Pre-fetch all data needed for the backtest period."""
        print("\nPre-fetching data for the entire backtest period...")
        
        # Convert end_date string to datetime, perform arithmetic, then back to string
        end_date_dt = datetime.strptime(self.end_date, "%Y-%m-%d")
        start_date_dt = end_date_dt - relativedelta(years=1)
        start_date_str = start_date_dt.strftime("%Y-%m-%d")
        
        for ticker in self.tickers:
            # Fetch price data for the entire period, plus 1 year 
            get_prices(ticker, start_date_str, self.end_date)
            
            # Fetch financial metrics
            get_financial_metrics(ticker, self.end_date, limit=10)
            
            # Fetch insider trades
            get_insider_trades(ticker, self.end_date, limit=1000)
            
            # Fetch common line items used by valuation agent
            search_line_items(
                ticker,
                [
                    "free_cash_flow",
                    "net_income",
                    "depreciation_and_amortization",
                    "capital_expenditure",
                    "working_capital",
                ],
                self.end_date,
                period="ttm",
                limit=2,  # Need current and previous for working capital change
            )
        
        print("Data pre-fetch complete.")

    def parse_agent_response(self, agent_output):
        try:
            # Expect JSON output from agent
            import json

            decision = json.loads(agent_output)
            return decision
        except:
            print(f"Error parsing action: {agent_output}")
            return "hold", 0

    def execute_trade(self, ticker: str, action: str, quantity: float, current_price: float):
        """Validate and execute trades based on portfolio constraints"""
        if action == "buy" and quantity > 0:
            cost = quantity * current_price
            if cost <= self.portfolio["cash"]:
                self.portfolio["positions"][ticker] += quantity
                self.portfolio["cash"] -= cost
                return quantity
            else:
                # Calculate maximum affordable quantity
                max_quantity = self.portfolio["cash"] // current_price
                if max_quantity > 0:
                    self.portfolio["positions"][ticker] += max_quantity
                    self.portfolio["cash"] -= max_quantity * current_price
                    return max_quantity
                return 0
        elif action == "sell" and quantity > 0:
            quantity = min(quantity, self.portfolio["positions"][ticker])
            if quantity > 0:
                self.portfolio["positions"][ticker] -= quantity
                self.portfolio["cash"] += quantity * current_price
                return quantity
            return 0
        return 0

    def run_backtest(self):
        # Pre-fetch all data at the start
        self.prefetch_data()
        
        dates = pd.date_range(self.start_date, self.end_date, freq="B")
        table_rows = []

        print("\nStarting backtest...")

        for current_date in dates:
            lookback_start = (current_date - timedelta(days=30)).strftime("%Y-%m-%d")
            current_date_str = current_date.strftime("%Y-%m-%d")

            output = self.agent(
                tickers=self.tickers,
                start_date=lookback_start,
                end_date=current_date_str,
                portfolio=self.portfolio,
                selected_analysts=self.selected_analysts,
            )

            decisions = output["decisions"]
            analyst_signals = output["analyst_signals"]
            total_value = self.portfolio["cash"]
            date_rows = []

            # Process each ticker's decision
            for ticker in self.tickers:
                decision = decisions.get(ticker, {"action": "hold", "quantity": 0})
                action, quantity = decision.get("action", "hold"), decision.get("quantity", 0)

                # Skip if we don't have enough lookback data
                if lookback_start == current_date_str:
                  continue
                
                # Get current price for the ticker
                df = get_price_data(ticker, lookback_start, current_date_str)
                current_price = df.iloc[-1]["close"]

                # Execute the trade with validation
                executed_quantity = self.execute_trade(ticker, action, quantity, current_price)

                # Calculate position value for this ticker
                shares_owned = self.portfolio["positions"][ticker]
                position_value = shares_owned * current_price
                total_value += position_value

                # Count signals for this ticker
                ticker_signals = {}
                for agent, signals in analyst_signals.items():
                    if ticker in signals:
                        ticker_signals[agent] = signals[ticker]
                
                bullish_count = len([s for s in ticker_signals.values() if s.get("signal", "").lower() == "bullish"])
                bearish_count = len([s for s in ticker_signals.values() if s.get("signal", "").lower() == "bearish"])
                neutral_count = len([s for s in ticker_signals.values() if s.get("signal", "").lower() == "neutral"])

                # Add row for this ticker
                date_rows.append(format_backtest_row(
                    date=current_date_str,
                    ticker=ticker,
                    action=action,
                    quantity=executed_quantity,
                    price=current_price,
                    shares_owned=shares_owned,
                    position_value=position_value,
                    bullish_count=bullish_count,
                    bearish_count=bearish_count,
                    neutral_count=neutral_count
                ))

            # Calculate overall portfolio return
            portfolio_return = (total_value / self.initial_capital - 1) * 100

            # Add summary row for this date
            date_rows.append(format_backtest_row(
                date=current_date_str,
                ticker="",  # Will be replaced with "PORTFOLIO SUMMARY"
                action="",
                quantity=0,
                price=0,
                shares_owned=0,
                position_value=0,
                bullish_count=0,
                bearish_count=0,
                neutral_count=0,
                is_summary=True,
                total_value=total_value,
                return_pct=portfolio_return
            ))

            # Add all rows for this date
            table_rows.extend(date_rows)

            # Temporarily stop progress display, show table, then resume
            print_backtest_results(table_rows)

            # Record the portfolio value
            self.portfolio_values.append(
                {"Date": current_date, "Portfolio Value": total_value}
            )

    def analyze_performance(self):
        # Convert portfolio values to DataFrame
        performance_df = pd.DataFrame(self.portfolio_values).set_index("Date")

        # Calculate total return
        total_return = (performance_df["Portfolio Value"].iloc[-1] - self.initial_capital) / self.initial_capital
        print(f"\n{Fore.WHITE}{Style.BRIGHT}PORTFOLIO PERFORMANCE SUMMARY:{Style.RESET_ALL}")
        print(f"Total Return: {Fore.GREEN if total_return >= 0 else Fore.RED}{total_return * 100:.2f}%{Style.RESET_ALL}")

        # Calculate individual ticker returns
        print(f"\n{Fore.WHITE}{Style.BRIGHT}INDIVIDUAL TICKER RETURNS:{Style.RESET_ALL}")
        for ticker in self.tickers:
            position_value = self.portfolio["positions"][ticker] * get_price_data(ticker, self.end_date, self.end_date).iloc[-1]["close"]
            ticker_return = ((position_value + self.portfolio["cash"] / len(self.tickers)) / (self.initial_capital / len(self.tickers)) - 1)
            print(f"{Fore.CYAN}{ticker}{Style.RESET_ALL}: {Fore.GREEN if ticker_return >= 0 else Fore.RED}{ticker_return * 100:.2f}%{Style.RESET_ALL}")

        # Plot the portfolio value over time
        plt.figure(figsize=(12, 6))
        plt.plot(performance_df.index, performance_df["Portfolio Value"], color='blue')
        plt.title("Portfolio Value Over Time")
        plt.ylabel("Portfolio Value ($)")
        plt.xlabel("Date")
        plt.grid(True)
        plt.show()

        # Compute daily returns
        performance_df["Daily Return"] = performance_df["Portfolio Value"].pct_change()

        # Calculate Sharpe Ratio (assuming 252 trading days in a year)
        mean_daily_return = performance_df["Daily Return"].mean()
        std_daily_return = performance_df["Daily Return"].std()
        sharpe_ratio = (mean_daily_return / std_daily_return) * (252**0.5) if std_daily_return != 0 else 0
        print(f"\nSharpe Ratio: {Fore.YELLOW}{sharpe_ratio:.2f}{Style.RESET_ALL}")

        # Calculate Maximum Drawdown
        rolling_max = performance_df["Portfolio Value"].cummax()
        drawdown = performance_df["Portfolio Value"] / rolling_max - 1
        max_drawdown = drawdown.min()
        print(f"Maximum Drawdown: {Fore.RED}{max_drawdown * 100:.2f}%{Style.RESET_ALL}")

        return performance_df


### 4. Run the Backtest #####
if __name__ == "__main__":
    import argparse

    # Set up argument parser
    parser = argparse.ArgumentParser(description="Run backtesting simulation")
    parser.add_argument("--tickers", type=str, required=True, help="Comma-separated list of stock ticker symbols (e.g., AAPL,MSFT,GOOGL)")
    parser.add_argument(
        "--end-date",
        type=str,
        default=datetime.now().strftime("%Y-%m-%d"),
        help="End date in YYYY-MM-DD format",
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=(datetime.now() - relativedelta(months=3)).strftime("%Y-%m-%d"),
        help="Start date in YYYY-MM-DD format",
    )
    parser.add_argument(
        "--initial-capital",
        type=float,
        default=100000,
        help="Initial capital amount (default: 100000)",
    )

    args = parser.parse_args()

    # Parse tickers from comma-separated string
    tickers = [ticker.strip() for ticker in args.tickers.split(",")]

    selected_analysts = None
    choices = questionary.checkbox(
        "Use the Space bar to select/unselect analysts.",
        choices=[
            questionary.Choice(display, value=value) for display, value in ANALYST_ORDER
        ],
        instruction="\n\nPress 'a' to toggle all.\n\nPress Enter when done to run the hedge fund.",
        validate=lambda x: len(x) > 0 or "You must select at least one analyst.",
        style=questionary.Style([
            ('checkbox-selected', 'fg:green'),
            ('selected', 'fg:green noinherit'),
            ('highlighted', 'noinherit'),
            ('pointer', 'noinherit'),
        ])
    ).ask()

    if not choices:
        print("You must select at least one analyst. Using all analysts by default.")
        selected_analysts = None
    else:
        selected_analysts = choices
        print(f"\nSelected analysts: {', '.join(Fore.GREEN + choice.title().replace('_', ' ') + Style.RESET_ALL for choice in choices)}")

    # Create an instance of Backtester
    backtester = Backtester(
        agent=run_hedge_fund,
        tickers=tickers,
        start_date=args.start_date,
        end_date=args.end_date,
        initial_capital=args.initial_capital,
        selected_analysts=selected_analysts,
    )

    # Run the backtesting process
    backtester.run_backtest()
    performance_df = backtester.analyze_performance()
