import asyncio
import json
import re
from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph

from app.backend.services.agent_service import create_agent_function
from src.agents.portfolio_manager import portfolio_management_agent
from src.agents.risk_manager import risk_management_agent
from src.main import start
from src.utils.analysts import ANALYST_CONFIG
from src.graph.state import AgentState


def extract_base_agent_key(unique_id: str) -> str:
    """
    Extract the base agent key from a unique node ID.
    
    Args:
        unique_id: The unique node ID with suffix (e.g., "warren_buffett_abc123")
    
    Returns:
        The base agent key (e.g., "warren_buffett")
    """
    # For agent nodes, remove the last underscore and 6-character suffix
    parts = unique_id.split('_')
    if len(parts) >= 2:
        last_part = parts[-1]
        # If the last part is a 6-character alphanumeric string, it's likely our suffix
        if len(last_part) == 6 and re.match(r'^[a-z0-9]+$', last_part):
            return '_'.join(parts[:-1])
    return unique_id  # Return original if no suffix pattern found


# Helper function to create the agent graph
def create_graph(selected_agents: list[str]) -> StateGraph:
    """Create the workflow with selected agents."""
    graph = StateGraph(AgentState)
    graph.add_node("start_node", start)

    # Extract base agent keys from unique node IDs
    base_agent_keys = [extract_base_agent_key(agent_id) for agent_id in selected_agents]

    # Create mapping from base agent key to unique node ID
    base_to_unique_mapping = {
        extract_base_agent_key(agent_id): agent_id 
        for agent_id in selected_agents
    }

    # Filter out any agents that are not in analyst.py
    valid_agent_keys = [agent for agent in base_agent_keys if agent in ANALYST_CONFIG]

    # Get analyst nodes from the configuration
    analyst_nodes = {key: (f"{key}_agent", config["agent_func"]) for key, config in ANALYST_CONFIG.items()}

    # Add selected analyst nodes
    for base_agent_key in valid_agent_keys:
        node_name, node_func = analyst_nodes[base_agent_key]
        unique_agent_id = base_to_unique_mapping[base_agent_key]
        agent_function = create_agent_function(node_func, unique_agent_id)
        graph.add_node(node_name, agent_function)
        graph.add_edge("start_node", node_name)

    # TODO - do not always add risk and portfolio management (for now)
    graph.add_node("risk_management_agent", risk_management_agent)

    portfolio_manager_function = create_agent_function(portfolio_management_agent, "portfolio_manager")
    graph.add_node("portfolio_manager", portfolio_manager_function)

    # Connect selected agents to risk management
    for base_agent_key in valid_agent_keys:
        node_name = analyst_nodes[base_agent_key][0]
        graph.add_edge(node_name, "risk_management_agent")

    # Connect the risk management agent to the portfolio management agent
    graph.add_edge("risk_management_agent", "portfolio_manager")

    # Connect the portfolio management agent to the end node
    graph.add_edge("portfolio_manager", END)

    # Set the entry point to the start node
    graph.set_entry_point("start_node")
    return graph


async def run_graph_async(graph, portfolio, tickers, start_date, end_date, model_name, model_provider, request=None):
    """Async wrapper for run_graph to work with asyncio."""
    # Use run_in_executor to run the synchronous function in a separate thread
    # so it doesn't block the event loop
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: run_graph(graph, portfolio, tickers, start_date, end_date, model_name, model_provider, request))  # Use default executor
    return result


def run_graph(
    graph: StateGraph,
    portfolio: dict,
    tickers: list[str],
    start_date: str,
    end_date: str,
    model_name: str,
    model_provider: str,
    request=None,
) -> dict:
    """
    Run the graph with the given portfolio, tickers,
    start date, end date, show reasoning, model name,
    and model provider.
    """
    return graph.invoke(
        {
            "messages": [
                HumanMessage(
                    content="Make trading decisions based on the provided data.",
                )
            ],
            "data": {
                "tickers": tickers,
                "portfolio": portfolio,
                "start_date": start_date,
                "end_date": end_date,
                "analyst_signals": {},
            },
            "metadata": {
                "show_reasoning": False,
                "model_name": model_name,
                "model_provider": model_provider,
                "request": request,  # Pass the request for agent-specific model access
            },
        },
    )


def parse_hedge_fund_response(response):
    """Parses a JSON string and returns a dictionary."""
    try:
        return json.loads(response)
    except json.JSONDecodeError as e:
        print(f"JSON decoding error: {e}\nResponse: {repr(response)}")
        return None
    except TypeError as e:
        print(f"Invalid response type (expected string, got {type(response).__name__}): {e}")
        return None
    except Exception as e:
        print(f"Unexpected error while parsing response: {e}\nResponse: {repr(response)}")
        return None
