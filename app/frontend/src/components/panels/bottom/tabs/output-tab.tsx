import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFlowContext } from '@/contexts/flow-context';
import { useNodeContext } from '@/contexts/node-context';
import { cn } from '@/lib/utils';
import { CheckCircle, Clock, Copy, MoreHorizontal, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface OutputTabProps {
  className?: string;
}

// Helper function to detect if content is JSON
function isJsonString(str: string): boolean {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

// Component to render reasoning content with JSON formatting and copy button
function ReasoningContent({ content }: { content: any }) {
  const [copySuccess, setCopySuccess] = useState(false);
  
  if (!content) return null;
  
  const contentString = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const isJson = isJsonString(contentString);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(contentString)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };
  
  return (
    <div className="group relative">
      <button 
        onClick={copyToClipboard}
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1 text-xs p-1 rounded hover:bg-accent bg-background text-muted-foreground border border-border"
        title="Copy to clipboard"
      >
        <Copy className="h-3 w-3" />
        <span className="text-xs">{copySuccess ? 'Copied!' : 'Copy'}</span>
      </button>
      
      {isJson ? (
        <div className="text-xs">
          <pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs leading-relaxed max-h-[150px] overflow-auto">
            {contentString}
          </pre>
        </div>
      ) : (
        <div className="text-sm">
          {contentString.split('\n').map((paragraph, idx) => (
            <p key={idx} className="mb-2 last:mb-0">{paragraph}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to get display name for agent
function getDisplayName(agentName: string): string {
  // Remove _agent suffix first
  let name = agentName.replace("_agent", "");
  
  // Remove ID suffix (everything after the last underscore if it looks like an ID)
  const lastUnderscoreIndex = name.lastIndexOf("_");
  if (lastUnderscoreIndex !== -1) {
    const potentialId = name.substring(lastUnderscoreIndex + 1);
    // If the part after the last underscore looks like an ID (alphanumeric, 5+ chars), remove it
    if (/^[a-zA-Z0-9]{5,}$/.test(potentialId)) {
      name = name.substring(0, lastUnderscoreIndex);
    }
  }
  
  // Replace remaining underscores with spaces and title case
  return name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

// Helper function to get status icon and color
function getStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case 'complete':
      return { icon: CheckCircle, color: 'text-green-500' };
    case 'error':
      return { icon: XCircle, color: 'text-red-500' };
    case 'in_progress':
      return { icon: MoreHorizontal, color: 'text-yellow-500' };
    default:
      return { icon: Clock, color: 'text-muted-foreground' };
  }
}

// Helper function to get signal color
function getSignalColor(signal: string): string {
  switch (signal.toUpperCase()) {
    case 'BULLISH':
      return 'text-green-500';
    case 'BEARISH':
      return 'text-red-500';
    case 'NEUTRAL':
      return 'text-yellow-500';
    default:
      return 'text-muted-foreground';
  }
}

// Helper function to get action color
function getActionColor(action: string): string {
  switch (action.toUpperCase()) {
    case 'BUY':
    case 'COVER':
      return 'text-green-500';
    case 'SELL':
    case 'SHORT':
      return 'text-red-500';
    case 'HOLD':
      return 'text-yellow-500';
    default:
      return 'text-muted-foreground';
  }
}

// Helper function to sort agents in display order
function sortAgents(agents: [string, any][]): [string, any][] {
  return agents.sort(([agentA, dataA], [agentB, dataB]) => {
    // First, sort by agent type priority (Risk Management and Portfolio Management at bottom)
    const getPriority = (agentName: string) => {
      if (agentName.includes("risk_management")) return 3;
      if (agentName.includes("portfolio_management")) return 4;
      return 1;
    };
    
    const priorityA = getPriority(agentA);
    const priorityB = getPriority(agentB);
    
    // If different priorities, sort by priority
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // If same priority, sort by timestamp (ascending - oldest first)
    const timestampA = dataA.timestamp ? new Date(dataA.timestamp).getTime() : 0;
    const timestampB = dataB.timestamp ? new Date(dataB.timestamp).getTime() : 0;
    
    if (timestampA !== timestampB) {
      return timestampA - timestampB;
    }
    
    // If no timestamp difference, sort alphabetically
    return agentA.localeCompare(agentB);
  });
}

export function OutputTab({ className }: OutputTabProps) {
  const { currentFlowId } = useFlowContext();
  const { getAgentNodeDataForFlow, getOutputNodeDataForFlow } = useNodeContext();
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  
  // Get current flow data
  const agentData = getAgentNodeDataForFlow(currentFlowId?.toString() || null);
  const outputData = getOutputNodeDataForFlow(currentFlowId?.toString() || null);
  
  // Force re-render periodically to show real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setUpdateTrigger(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Sort agents for display
  const sortedAgents = sortAgents(Object.entries(agentData));
  
  // Get list of tickers for tabs
  const tickers = outputData?.decisions ? Object.keys(outputData.decisions) : [];
  
  // Set default selected ticker
  useEffect(() => {
    if (tickers.length > 0 && !selectedTicker) {
      setSelectedTicker(tickers[0]);
    }
  }, [tickers, selectedTicker]);
  
  return (
    <div className={cn("h-full overflow-y-auto font-mono text-sm", className)}>
      {/* Agent Progress Section */}
      {sortedAgents.length > 0 && (
          <Card className="bg-transparent mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Progress</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-1">
            {sortedAgents.map(([agentId, data]) => {
              const { icon: StatusIcon, color } = getStatusIcon(data.status);
              const displayName = getDisplayName(agentId);
              
              return (
                <div key={agentId} className="flex items-center gap-2">
                  <StatusIcon className={cn("h-4 w-4 flex-shrink-0", color)} />
                  <span className="font-medium">{displayName}</span>
                  {data.ticker && (
                    <span>[{data.ticker}]</span>
                  )}
                  <span className={cn("flex-1", color)}>
                    {data.message || data.status}
                  </span>
                  {data.timestamp && (
                    <span className="text-muted-foreground text-xs">
                      {new Date(data.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
        </CardContent>
        </Card>
      )}

      {/* Summary */}
      {outputData && (
        <Card className="bg-transparent mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(outputData.decisions).map(([ticker, decision]) => (
                      <TableRow key={ticker}>
                        <TableCell className="font-medium">{ticker}</TableCell>
                        <TableCell>
                          <span className={cn("font-medium", getActionColor(decision.action || ''))}>
                            {decision.action?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </TableCell>
                        <TableCell>{decision.quantity || 0}</TableCell>
                        <TableCell>{decision.confidence?.toFixed(1) || 0}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
      )}
      {/* Analysis Results Section */}
      {outputData && tickers.length > 0 && (
        <Card className="bg-transparent">
          <CardHeader>
            <CardTitle className="text-lg">Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            
            <Tabs value={selectedTicker} onValueChange={setSelectedTicker} className="w-full">
              <TabsList className="flex space-x-1 bg-muted p-1 rounded-lg mb-4">
                {tickers.map((ticker) => (
                  <TabsTrigger 
                    key={ticker} 
                    value={ticker} 
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-colors data-[state=active]:active-bg data-[state=active]:text-blue-500 data-[state=active]:shadow-sm text-primary hover:text-primary hover-bg"
                  >
                    {ticker}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {tickers.map((ticker) => {
                const decision = outputData.decisions![ticker];
                
                return (
                  <TabsContent key={ticker} value={ticker} className="space-y-4">
                    {/* Agent Analysis */}
                    
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Agent</TableHead>
                              <TableHead>Signal</TableHead>
                              <TableHead>Confidence</TableHead>
                              <TableHead>Reasoning</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(outputData.analyst_signals || {})
                              .filter(([agent, signals]) => 
                                ticker in signals && !agent.includes("risk_management")
                              )
                              .sort(([agentA], [agentB]) => agentA.localeCompare(agentB))
                              .map(([agent, signals]) => {
                                const signal = signals[ticker];
                                const signalType = signal.signal?.toUpperCase() || 'UNKNOWN';
                                const signalColor = getSignalColor(signalType);
                                
                                return (
                                  <TableRow key={agent}>
                                    <TableCell className="font-medium">
                                      {getDisplayName(agent)}
                                    </TableCell>
                                    <TableCell>
                                      <span className={cn("font-medium", signalColor)}>
                                        {signalType}
                                      </span>
                                    </TableCell>
                                    <TableCell>{signal.confidence || 0}%</TableCell>
                                    <TableCell className="max-w-md">
                                      <ReasoningContent content={signal.reasoning} />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                    
                    {/* Trading Decision */}
                    
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Property</TableHead>
                              <TableHead>Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-medium">Action</TableCell>
                              <TableCell>
                                <span className={cn("font-medium", getActionColor(decision.action || ''))}>
                                  {decision.action?.toUpperCase() || 'UNKNOWN'}
                                </span>
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Quantity</TableCell>
                              <TableCell>{decision.quantity || 0}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Confidence</TableCell>
                              <TableCell>{decision.confidence?.toFixed(1) || 0}%</TableCell>
                            </TableRow>
                            {decision.reasoning && (
                              <TableRow>
                                <TableCell className="font-medium">Reasoning</TableCell>
                                <TableCell className="max-w-md">
                                  <ReasoningContent content={decision.reasoning} />
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      )}
      
      {/* Empty State */}
      {!outputData && sortedAgents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No output to display. Run an analysis to see progress and results.
        </div>
      )}
    </div>
  );
} 