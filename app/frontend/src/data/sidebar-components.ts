import {
  BadgeDollarSign,
  Bot,
  Brain,
  Calculator,
  Lightbulb,
  List,
  LucideIcon,
  Network,
  Play
} from 'lucide-react';
import { Agent, getAgents } from './agents';

// Define component items by group
export interface ComponentItem {
  name: string;
  icon: LucideIcon;
}

export interface ComponentGroup {
  name: string;
  icon: LucideIcon;
  iconColor: string;
  items: ComponentItem[];
}

/**
 * Get all component groups, including agents fetched from the backend
 */
export const getComponentGroups = async (): Promise<ComponentGroup[]> => {
  const agents = await getAgents();
  
  return [
    {
      name: "Start Nodes",
      icon: Play,
      iconColor: "text-blue-400",
      items: [
        { name: "Stock Tickers", icon: List },
      ]
    },
    {
      name: "Analysts",
      icon: Bot,
      iconColor: "text-red-400",
      items: agents.map((agent: Agent) => ({
        name: agent.display_name,
        icon: Bot
      }))
    },
    {
      name: "Teams",
      icon: Network,
      iconColor: "text-yellow-400",
      items: [
        { name: "Data Wizards", icon: Calculator },
        { name: "Value Investors", icon: BadgeDollarSign },
      ]
    },
    {
      name: "Decision Makers",
      icon: Lightbulb,
      iconColor: "text-green-400",
      items: [
        { name: "Portfolio Manager", icon: Brain },
        // { name: "JSON Output", icon: FileJson },
        // { name: "Investment Report", icon: FileText },
      ]
    },
  ];
};