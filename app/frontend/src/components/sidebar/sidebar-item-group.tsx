import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ComponentGroup, ComponentItem } from '@/data/sidebar-components';
import { SidebarItem } from './sidebar-item';

interface SidebarItemGroupProps {
  group: ComponentGroup;
  activeItem: string | null;
  onComponentAdd?: (componentName: string) => void;
}

export function SidebarItemGroup({ 
  group, 
  activeItem, 
  onComponentAdd
}: SidebarItemGroupProps) {
  const { name, icon: Icon, iconColor, items } = group;
  
  return (
    <AccordionItem key={name} value={name} className="border-none">
      <AccordionTrigger className="px-4 py-2 text-sm hover:bg-ramp-grey-700 hover:no-underline">
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconColor} />
          <span className="capitalize">{name}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4">
        <div className="space-y-1">
          {items.map((item: ComponentItem) => (
            <SidebarItem 
              key={item.name}
              icon={item.icon} 
              label={item.name} 
              isActive={activeItem === item.name}
              onClick={onComponentAdd ? () => onComponentAdd(item.name) : undefined}
              onAddClick={onComponentAdd ? () => onComponentAdd(item.name) : undefined}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
} 