import { useReactFlow, type NodeProps } from '@xyflow/react';
import { PieChart, Play, Plus, Square, X } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFlowContext } from '@/contexts/flow-context';
import { useNodeContext } from '@/contexts/node-context';
import { getDefaultModel, getModels, LanguageModel } from '@/data/models';
import { useFlowConnection } from '@/hooks/use-flow-connection';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useNodeState } from '@/hooks/use-node-state';
import { formatKeyboardShortcut } from '@/lib/utils';
import { type PortfolioAnalyzerNode } from '../types';
import { NodeShell } from './node-shell';

interface PortfolioPosition {
  ticker: string;
  quantity: string;
  tradePrice: string;
}

export function PortfolioAnalyzerNode({
  data,
  selected,
  id,
  isConnectable,
}: NodeProps<PortfolioAnalyzerNode>) {
  // Calculate default dates
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);
  
  // Use persistent state hooks
  const [positions, setPositions] = useNodeState<PortfolioPosition[]>(id, 'positions', [
    { ticker: '', quantity: '', tradePrice: '' },
  ]);
  const [selectedModel, setSelectedModel] = useNodeState<LanguageModel | null>(id, 'selectedModel', null);
  const [availableModels, setAvailableModels] = useNodeState<LanguageModel[]>(id, 'availableModels', []);
  const [startDate, setStartDate] = useNodeState(id, 'startDate', threeMonthsAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useNodeState(id, 'endDate', today.toISOString().split('T')[0]);
  const [initialCash, setInitialCash] = useNodeState(id, 'initialCash', '100000');
  
  const { currentFlowId } = useFlowContext();
  const nodeContext = useNodeContext();
  const { getAllAgentModels } = nodeContext;
  const { getNodes, getEdges } = useReactFlow();
  
  // Use the new flow connection hook
  const flowId = currentFlowId?.toString() || null;
  const {
    isConnecting,
    isConnected,
    isProcessing,
    canRun,
    runFlow,
    stopFlow,
    recoverFlowState
  } = useFlowConnection(flowId);
  
  // Check if the portfolio analyzer can be run
  const canRunPortfolioAnalyzer = canRun && positions.length > 0 && positions.every(pos => pos.ticker.trim() !== '');
  
  // Add keyboard shortcut for Cmd+Enter / Ctrl+Enter to run portfolio analyzer
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'Enter',
        ctrlKey: true,
        metaKey: true,
        callback: () => {
          if (canRunPortfolioAnalyzer) {
            handlePlay();
          }
        },
        preventDefault: true,
      },
    ],
  });
  
  // Load models and set default on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const [models, defaultModel] = await Promise.all([
          getModels(),
          getDefaultModel()
        ]);
        setAvailableModels(models);
        
        // Only set default model if no model is currently selected
        if (!selectedModel && defaultModel) {
          setSelectedModel(defaultModel);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        // Keep empty array and null as fallback
      }
    };
    
    loadModels();
  }, []); // Remove selectedModel from dependencies to avoid infinite loop

  // Recover flow state when component mounts or flow changes
  useEffect(() => {
    if (flowId) {
      recoverFlowState();
    }
  }, [flowId, recoverFlowState]);
  
  const handlePositionChange = (index: number, field: keyof PortfolioPosition, value: string) => {
    const newPositions = [...positions];
    newPositions[index] = { ...newPositions[index], [field]: value };
    setPositions(newPositions);
  };

  const handleAddPosition = () => {
    const newPosition: PortfolioPosition = { ticker: '', quantity: '', tradePrice: '' };
    setPositions([...positions, newPosition]);
  };

  const handleRemovePosition = (index: number) => {
    if (positions.length > 1) {
      const newPositions = positions.filter((_, i) => i !== index);
      setPositions(newPositions);
    }
  };

  const handleInitialCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove non-numeric characters except decimal point
    const numericValue = e.target.value.replace(/[^0-9.]/g, '');
    setInitialCash(numericValue);
  };

  // Format the display value with commas
  const formatCurrency = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-US');
  };

  // Format numeric input for display
  const formatNumericValue = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-US');
  };

  const handleStop = () => {
    stopFlow();
  };

  const handlePlay = () => {
    // Get the current flow's nodes and edges
    const allNodes = getNodes();
    const allEdges = getEdges();
    
    // Find all nodes that are reachable from the portfolio-analyzer-node
    const reachableNodes = new Set<string>();
    const visited = new Set<string>();
    
    // DFS to find all reachable nodes
    const dfs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      // If this is not the portfolio-analyzer-node itself, add it to reachable nodes
      if (nodeId !== id) {
        reachableNodes.add(nodeId);
      }
      
      // Find all outgoing edges from this node
      const outgoingEdges = allEdges.filter(edge => edge.source === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.target);
      }
    };
    
    // Start DFS from the portfolio-analyzer-node
    dfs(id);
    
    // Filter nodes to only include reachable ones
    const agentNodes = allNodes.filter(node => reachableNodes.has(node.id));
    
    // Filter edges to only include connections between reachable nodes (plus the portfolio-analyzer-node)
    const reachableNodeIds = new Set([id, ...reachableNodes]);
    const validEdges = allEdges.filter(edge => 
      reachableNodeIds.has(edge.source) && reachableNodeIds.has(edge.target)
    );

    // Collect agent models from all agent nodes
    const agentModels = [];
    const allAgentModels = getAllAgentModels(flowId);
    for (const node of agentNodes) {
      const model = allAgentModels[node.id];
      if (model) {
        agentModels.push({
          agent_id: node.id,
          model_name: model.model_name,
          model_provider: model.provider as any
        });
      }
    }
    
    // Convert positions to the expected format for future backend use
    const portfolioPositions = positions.map(pos => ({
      ticker: pos.ticker.trim(),
      quantity: parseFloat(pos.quantity) || 0,
      trade_price: parseFloat(pos.tradePrice) || 0
    }));
    
    // For now, extract tickers for current API compatibility
    const tickerList = positions.map(pos => pos.ticker.trim()).filter(ticker => ticker !== '');
        
    // Use the flow connection hook to run the flow
    runFlow({
      tickers: tickerList,
      // Send the actual graph structure instead of just selected agents
      graph_nodes: agentNodes.map(node => ({
        id: node.id,
        type: node.type,
        data: node.data,
        position: node.position
      })),
      graph_edges: validEdges,
      agent_models: agentModels,
      // Keep global model for backwards compatibility (will be removed later)
      model_name: selectedModel?.model_name || undefined,
      model_provider: selectedModel?.provider as any || undefined,
      start_date: startDate,
      end_date: endDate,
      initial_cash: parseFloat(initialCash) || 100000,
      // TODO: Add portfolio_positions when backend supports it
      // portfolio_positions: portfolioPositions,
    });
  };

  // Determine if we're processing (connecting, connected, or any agents running)
  const showAsProcessing = isConnecting || isConnected || isProcessing;

  return (
    <TooltipProvider>
      <NodeShell
        id={id}
        selected={selected}
        isConnectable={isConnectable}
        icon={<PieChart className="h-5 w-5" />}
        name={data.name || "Portfolio Analyzer"}
        description={data.description}
        hasLeftHandle={false}
        width="w-96"
      >
        <CardContent className="p-0">
          <div className="border-t border-border p-3">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-subtitle text-primary flex items-center gap-1">
                  Initial Cash
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none">
                      $
                    </div>
                    <Input
                      type="text"
                      placeholder="100,000"
                      value={formatCurrency(initialCash)}
                      onChange={handleInitialCashChange}
                      className="pl-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <Button 
                    size="icon" 
                    variant="secondary"
                    className="flex-shrink-0 transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-95"
                    title={showAsProcessing ? "Stop" : `Run (${formatKeyboardShortcut('↵')})`}
                    onClick={showAsProcessing ? handleStop : handlePlay}
                    disabled={!canRunPortfolioAnalyzer && !showAsProcessing}
                  >
                    {showAsProcessing ? (
                      <Square className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-subtitle text-primary flex items-center gap-1">
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <span>Positions</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      Add your portfolio positions with ticker, quantity, and trade price
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-2">
                  {positions.map((position, index) => {
                    return (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        placeholder="Ticker"
                        value={position.ticker}
                        onChange={(e) => handlePositionChange(index, 'ticker', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Quantity"
                        value={formatNumericValue(position.quantity)}
                        onChange={(e) => handlePositionChange(index, 'quantity', e.target.value.replace(/[^0-9.]/g, ''))}
                        className="flex-1"
                      />
                      <div className="relative flex-1">
                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none">
                          $
                        </div>
                        <Input
                          placeholder="Price"
                          value={formatNumericValue(position.tradePrice)}
                          onChange={(e) => handlePositionChange(index, 'tradePrice', e.target.value.replace(/[^0-9.]/g, ''))}
                          className="pl-8"
                        />
                      </div>
                      {positions.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemovePosition(index)}
                          className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    );
                  })}
                  <Button
                    onClick={handleAddPosition}
                    className="w-full mt-2"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Position
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </NodeShell>
    </TooltipProvider>
  );
}
