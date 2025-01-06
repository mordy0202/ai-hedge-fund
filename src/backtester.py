from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

import matplotlib.pyplot as plt
import pandas as pd
from tabulate import tabulate
from colorama import Fore, Back, Style, init

from main import run_hedge_fund
from tools.api import get_price_data

init(autoreset=True)


class Backtester:
    def __init__(self, agent, ticker, start_date, end_date, initial_capital):
        self.agent = agent
        self.ticker = ticker
        self.start_date = start_date
        self.end_date = end_date
        self.initial_capital = initial_capital
        self.portfolio = {"cash": initial_capital, "stock": 0}
        self.portfolio_values = []

    def parse_agent_response(self, agent_output):
        try:
            # Expect JSON output from agent
            import json

            decision = json.loads(agent_output)
            return decision
        except:
            print(f"Error parsing action: {agent_output}")
            return "hold", 0

    def execute_trade(self, action, quantity, current_price):
        """Validate and execute trades based on portfolio constraints"""
        if action == "buy" and quantity > 0:
            cost = quantity * current_price
            if cost <= self.portfolio["cash"]:
                self.portfolio["stock"] += quantity
                self.portfolio["cash"] -= cost
                return quantity
            else:
                # Calculate maximum affordable quantity
                max_quantity = self.portfolio["cash"] // current_price
                if max_quantity > 0:
                    self.portfolio["stock"] += max_quantity
                    self.portfolio["cash"] -= max_quantity * current_price
                    return max_quantity
                return 0
        elif action == "sell" and quantity > 0:
            quantity = min(quantity, self.portfolio["stock"])
            if quantity > 0:
                self.portfolio["cash"] += quantity * current_price
                self.portfolio["stock"] -= quantity
                return quantity
            return 0
        return 0

    def run_backtest(self):
        dates = pd.date_range(self.start_date, self.end_date, freq="B")
        
        # Create a list to store rows for tabulation
        table_rows = []
        headers = ["Date", "Ticker", "Action", "Quantity", "Price", "Cash", "Stock", "Total Value", "Bullish", "Bearish", "Neutral"]

        print("\nStarting backtest...")

        for current_date in dates:
            lookback_start = (current_date - timedelta(days=30)).strftime("%Y-%m-%d")
            current_date_str = current_date.strftime("%Y-%m-%d")

            output = self.agent(
                ticker=self.ticker,
                start_date=lookback_start,
                end_date=current_date_str,
                portfolio=self.portfolio,
            )

            agent_decision = output["decision"]
            action, quantity = agent_decision["action"], agent_decision["quantity"]
            df = get_price_data(self.ticker, lookback_start, current_date_str)
            current_price = df.iloc[-1]["close"]

            # Execute the trade with validation
            executed_quantity = self.execute_trade(action, quantity, current_price)

            # Update total portfolio value
            total_value = (
                self.portfolio["cash"] + self.portfolio["stock"] * current_price
            )
            self.portfolio["portfolio_value"] = total_value

            # Get the signals from the analyst_signals and print them
            analyst_signals = output["analyst_signals"]
            bullish_signals = [
                signal
                for signal in analyst_signals.values()
                if signal.get("signal") == "bullish"
            ]
            bearish_signals = [
                signal
                for signal in analyst_signals.values()
                if signal.get("signal") == "bearish"
            ]
            neutral_signals = [
                signal
                for signal in analyst_signals.values()
                if signal.get("signal") == "neutral"
            ]

            # Color-coded row data
            action_color = {
                "buy": Fore.GREEN,
                "sell": Fore.RED,
                "hold": Fore.YELLOW
            }.get(action, "")

            # Format row with colors
            table_rows.append([
                current_date.strftime('%Y-%m-%d'),
                f"{Fore.CYAN}{self.ticker}{Style.RESET_ALL}",
                f"{action_color}{action}{Style.RESET_ALL}",
                f"{action_color}{executed_quantity}{Style.RESET_ALL}",
                f"{Fore.WHITE}{current_price:.2f}{Style.RESET_ALL}",
                f"{Fore.YELLOW}{self.portfolio['cash']:.2f}{Style.RESET_ALL}",
                f"{Fore.WHITE}{self.portfolio['stock']}{Style.RESET_ALL}",
                f"{Fore.YELLOW}{total_value:.2f}{Style.RESET_ALL}",
                f"{Fore.GREEN}{len(bullish_signals)}{Style.RESET_ALL}",
                f"{Fore.RED}{len(bearish_signals)}{Style.RESET_ALL}",
                f"{Fore.BLUE}{len(neutral_signals)}{Style.RESET_ALL}"
            ])

            # Clear screen and display colored table
            print("\033[H\033[J")
            print(f"{tabulate(table_rows, headers=headers, tablefmt='grid')}{Style.RESET_ALL}")

            # Record the portfolio value
            self.portfolio_values.append(
                {"Date": current_date, "Portfolio Value": total_value}
            )

    def analyze_performance(self):
        # Convert portfolio values to DataFrame
        performance_df = pd.DataFrame(self.portfolio_values).set_index("Date")

        # Calculate total return
        total_return = (
            self.portfolio["portfolio_value"] - self.initial_capital
        ) / self.initial_capital
        print(f"Total Return: {total_return * 100:.2f}%")

        # Plot the portfolio value over time
        performance_df["Portfolio Value"].plot(
            title="Portfolio Value Over Time", figsize=(12, 6)
        )
        plt.ylabel("Portfolio Value ($)")
        plt.xlabel("Date")
        plt.show()

        # Compute daily returns
        performance_df["Daily Return"] = performance_df["Portfolio Value"].pct_change()

        # Calculate Sharpe Ratio (assuming 252 trading days in a year)
        mean_daily_return = performance_df["Daily Return"].mean()
        std_daily_return = performance_df["Daily Return"].std()
        sharpe_ratio = (mean_daily_return / std_daily_return) * (252**0.5)
        print(f"Sharpe Ratio: {sharpe_ratio:.2f}")

        # Calculate Maximum Drawdown
        rolling_max = performance_df["Portfolio Value"].cummax()
        drawdown = performance_df["Portfolio Value"] / rolling_max - 1
        max_drawdown = drawdown.min()
        print(f"Maximum Drawdown: {max_drawdown * 100:.2f}%")

        return performance_df


### 4. Run the Backtest #####
if __name__ == "__main__":
    import argparse

    # Set up argument parser
    parser = argparse.ArgumentParser(description="Run backtesting simulation")
    parser.add_argument("--ticker", type=str, help="Stock ticker symbol (e.g., AAPL)")
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

    # Create an instance of Backtester
    backtester = Backtester(
        agent=run_hedge_fund,
        ticker=args.ticker,
        start_date=args.start_date,
        end_date=args.end_date,
        initial_capital=args.initial_capital,
    )

    # Run the backtesting process
    backtester.run_backtest()
    performance_df = backtester.analyze_performance()
