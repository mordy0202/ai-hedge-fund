import { Card, CardContent } from '@/components/ui/card';

export function FlowsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary mb-2">Flows</h2>
        <p className="text-sm text-muted-foreground">
          Configure default behavior for flows and nodes.
        </p>
      </div>
      <Card className="bg-panel border-gray-700 dark:border-gray-700">
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">
            Flow-specific settings will be implemented here.
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 