'use client';

import { useState, type ComponentType } from 'react';
import { Building2, Hammer, Link2, PanelLeftClose, Plus, Search, Sofa, Refrigerator, Trees, Columns3, X, ArrowUpRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CATALOG, type Kind, type Tool } from '@/lib/habitat/domain';

const sections = [
  { id: 'structure', label: 'Construir', Icon: Hammer },
  { id: 'furniture', label: 'Móveis', Icon: Sofa },
  { id: 'appliances', label: 'Eletros', Icon: Refrigerator },
  { id: 'outdoor', label: 'Área externa', Icon: Trees },
  { id: 'woodwork', label: 'Marcenaria', Icon: Columns3 },
];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
type Props = {
  open: boolean;
  category: string;
  onCategory: (value: string) => void;
  tool: Tool;
  placing: Kind;
  icons: Record<Kind, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>>;
  onChoose: (kind: Kind) => void;
  onClose: () => void;
  onProduct: () => void;
  onBuilding: () => void;
  onNew: () => void;
};

export default function CatalogPanel({ open, category, onCategory, tool, placing, icons, onChoose, onClose, onProduct, onBuilding, onNew }: Props) {
  const [query, setQuery] = useState('');
  const search = normalize(query);
  const matches = CATALOG.filter(item => !search || normalize(`${item.name} ${item.hint}`).includes(search));
  const cards = (items: typeof CATALOG) => items.length ? <div className="catalog-grid">
    {items.map(item => {
      const Icon = icons[item.kind];
      const active = !['select', 'move'].includes(tool) && placing === item.kind;
      const action = item.kind === 'wall' ? 'Desenhar parede' : item.kind === 'room' ? 'Desenhar cômodo' : ['roof', 'slab', 'pergola'].includes(item.kind) ? 'Desenhar cobertura' : `${item.w.toFixed(1)} × ${item.d.toFixed(1)} m`;
      return <button className={`catalog-card ${active ? 'active' : ''}`} key={item.kind} onClick={() => onChoose(item.kind)} title={item.hint} aria-pressed={active} data-testid={`catalog-${item.kind}`}>
        <div className={`catalog-icon ${item.section}`}><Icon size={27} strokeWidth={1.5} /></div>
        {active && <Check className="catalog-selected" size={13} aria-hidden="true" />}
        <strong>{item.name}</strong><span>{action}</span>
      </button>;
    })}
  </div> : <div className="catalog-empty" role="status"><Search size={24} /><strong>Nenhum item encontrado</strong><p>Tente “parede”, “sofá” ou “planta”.</p><Button variant="outline" size="sm" onClick={() => setQuery('')}>Limpar busca</Button></div>;

  return <aside id="element-library" className={`library-panel ${open ? 'open' : 'collapsed'}`} aria-label="Biblioteca de elementos">
    <div className="panel-heading"><div><span className="panel-kicker">CRIAR SEU ESPAÇO</span><h2>Biblioteca</h2></div><Button variant="ghost" size="icon-sm" aria-label="Recolher biblioteca" title="Recolher biblioteca" onClick={onClose}><PanelLeftClose size={17} /></Button></div>
    <div className="catalog-search"><Search size={16} aria-hidden="true" /><Input type="search" aria-label="Buscar elementos na biblioteca" placeholder="Buscar móveis, paredes…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); } }} />{query && <button aria-label="Limpar busca" onClick={() => setQuery('')}><X size={14} /></button>}</div>
    <Tabs value={category} onValueChange={value => { onCategory(value); setQuery(''); }} className={`library-tabs ${search ? 'is-searching' : ''}`}>
      <TabsList className="catalog-tabs" aria-label="Categorias da biblioteca">{sections.map(({ id, label, Icon }) => <TabsTrigger key={id} value={id}><Icon size={15} /><span>{label}</span></TabsTrigger>)}</TabsList>
      {search ? <TabsContent value={category} className="catalog-content catalog-search-results"><div className="eyebrow">Todas as categorias<span aria-live="polite">{matches.length} itens</span></div>{cards(matches)}</TabsContent> : sections.map(section => <TabsContent value={section.id} key={section.id} className="catalog-content"><div className="eyebrow">{section.label}<span>{CATALOG.filter(i => i.section === section.id).length} itens</span></div>{cards(CATALOG.filter(i => i.section === section.id))}</TabsContent>)}
    </Tabs>
    <div className="library-bottom"><Button variant="outline" className="import-product-button" onClick={onProduct}><Link2 size={16} /><span>Importar produto por link</span><ArrowUpRight size={14} /></Button><div className="library-project-actions"><Button variant="ghost" className="generate-button" onClick={onBuilding}><Building2 size={15} />Gerar prédio</Button><Button variant="ghost" className="new-project" onClick={onNew}><Plus size={15} />Novo projeto</Button></div></div>
  </aside>;
}
