import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Search,
  Filter,
  RefreshCw,
  Save,
  Layers,
  Sparkles,
  Link as LinkIcon,
  X,
  Check,
  AlertTriangle,
  Trash2,
  Sliders,
  ChevronRight,
  Database,
} from 'lucide-react';

import { TableNode } from './TableNode';
import {
  SemanticGraphNode,
  SemanticGraphEdge,
  fetchSemanticGraphApi,
  saveSemanticLayoutApi,
  updateSemanticTableApi,
  updateSemanticColumnApi,
  createSemanticRelationshipApi,
  updateSemanticRelationshipApi,
  deleteSemanticRelationshipApi,
  syncSemanticSchemaApi,
} from '../../services/semanticApi';

interface DataMapCanvasProps {
  token: string;
  dataSourceId: string;
  dataSourceName: string;
}

const nodeTypes = {
  tableNode: TableNode,
};

export const DataMapCanvas: React.FC<DataMapCanvasProps> = ({
  token,
  dataSourceId,
  dataSourceName,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rawNodes, setRawNodes] = useState<SemanticGraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<SemanticGraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [onlyAiEnabled, setOnlyAiEnabled] = useState(false);
  const [neighborhoodHops, setNeighborhoodHops] = useState<number | null>(null);

  // Painel Lateral (Gaveta)
  const [selectedTable, setSelectedTable] = useState<SemanticGraphNode | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<any | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SemanticGraphEdge | null>(null);
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);

  // Modal de Criação de Conexão
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [relModalData, setRelModalData] = useState({
    cardinality: 'N:1',
    relType: 'logical',
    joinType: 'INNER',
    businessDescription: '',
    usageNotes: '',
    priority: 'normal',
  });

  // Carregar Grafo da Camada Semântica
  const loadGraph = useCallback(async () => {
    if (!token || !dataSourceId) return;
    setIsLoading(true);
    try {
      const data = await fetchSemanticGraphApi(token, dataSourceId);
      if (data.success) {
        setRawNodes(data.nodes);
        setRawEdges(data.edges);
      }
    } catch (err) {
      console.error('Erro ao carregar grafo semântico:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, dataSourceId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Lista de Domínios únicos para o filtro
  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    rawNodes.forEach((n) => {
      if (n.domain) set.add(n.domain);
    });
    return Array.from(set);
  }, [rawNodes]);

  // Processamento e Filtragem de Nós e Arestas para o React Flow
  useEffect(() => {
    let filtered = rawNodes;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.tableName.toLowerCase().includes(term) ||
          n.displayName.toLowerCase().includes(term) ||
          n.columns.some((c) => c.columnName.toLowerCase().includes(term) || (c.displayName && c.displayName.toLowerCase().includes(term)))
      );
    }

    if (domainFilter !== 'all') {
      filtered = filtered.filter((n) => n.domain === domainFilter);
    }

    if (onlyAiEnabled) {
      filtered = filtered.filter((n) => n.aiEnabled);
    }

    const visibleNodeIds = new Set(filtered.map((n) => n.id));

    // Converter para Nós React Flow com posição e dados
    const flowNodes: Node[] = filtered.map((n, idx) => {
      // Se a posição persistida for (0,0), distribuir em grid automática inicial
      const defaultX = (idx % 4) * 360 + 50;
      const defaultY = Math.floor(idx / 4) * 400 + 50;

      return {
        id: n.id,
        type: 'tableNode',
        position: {
          x: n.posX !== 0 ? n.posX : defaultX,
          y: n.posY !== 0 ? n.posY : defaultY,
        },
        data: {
          ...n,
          onSelectTable: (table: SemanticGraphNode) => {
            setSelectedTable(table);
            setSelectedColumn(null);
            setSelectedEdge(null);
          },
          onSelectColumn: (col: any, table: SemanticGraphNode) => {
            setSelectedTable(table);
            setSelectedColumn(col);
            setSelectedEdge(null);
          },
        },
      };
    });

    // Converter para Arestas React Flow com cores por tipo de relacionamento
    const flowEdges: Edge[] = rawEdges
      .filter((e) => visibleNodeIds.has(e.sourceTableId) && visibleNodeIds.has(e.targetTableId))
      .map((e) => {
        let strokeColor = '#06b6d4'; // Cyan default (physical)
        let strokeDash = undefined;
        let animated = e.status === 'validated';

        if (e.isCrossSource || e.relType === 'cross_source') {
          strokeColor = '#ec4899'; // Fuchsia for cross-source
          strokeDash = '4,4';
          animated = true;
        } else if (e.relType === 'logical') {
          strokeColor = '#a855f7'; // Purple
        } else if (e.relType === 'semantic') {
          strokeColor = '#10b981'; // Emerald
        }

        if (e.status === 'suggested') {
          strokeColor = '#f59e0b'; // Amber
          strokeDash = '5,5';
        } else if (e.status === 'disabled') {
          strokeColor = '#64748b'; // Slate
          strokeDash = '4,4';
        }

        const isCross = e.isCrossSource || e.relType === 'cross_source';

        return {
          id: e.id,
          source: e.sourceTableId,
          sourceHandle: `${e.sourceColumnName}-source`,
          target: e.targetTableId,
          targetHandle: `${e.targetColumnName}-target`,
          animated,
          label: isCross ? `${e.cardinality} (${e.joinType} • Cross)` : `${e.cardinality} (${e.joinType})`,
          labelStyle: { fill: isCross ? '#f472b6' : '#94a3b8', fontSize: 10, fontFamily: 'monospace', fontWeight: isCross ? 'bold' : 'normal' },
          labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          style: {
            stroke: strokeColor,
            strokeWidth: isCross ? 2.5 : 2,
            strokeDasharray: strokeDash,
            opacity: e.status === 'disabled' ? 0.4 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: strokeColor,
            width: 15,
            height: 15,
          },
        };
      });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [rawNodes, rawEdges, searchTerm, domainFilter, onlyAiEnabled]);

  // Manipulador de Conexão Arrastada entre Tabelas/Colunas
  const onConnect = useCallback((params: Connection) => {
    setPendingConnection(params);
  }, []);

  // Confirmar Criação de Relacionamento arrastado
  const handleConfirmConnection = async () => {
    if (!pendingConnection || !token || !dataSourceId) return;

    const sourceTable = rawNodes.find((n) => n.id === pendingConnection.source);
    const targetTable = rawNodes.find((n) => n.id === pendingConnection.target);

    // Extrair o nome da coluna a partir do handle ID (ex: "id_cliente-source" -> "id_cliente")
    const srcColName = pendingConnection.sourceHandle?.replace(/-source$/, '');
    const tgtColName = pendingConnection.targetHandle?.replace(/-target$/, '');

    const sourceCol = sourceTable?.columns.find((c) => c.columnName === srcColName);
    const targetCol = targetTable?.columns.find((c) => c.columnName === tgtColName);

    if (!sourceTable || !targetTable || !sourceCol || !targetCol) {
      alert('Falha ao identificar as colunas conectadas.');
      setPendingConnection(null);
      return;
    }

    try {
      const res = await createSemanticRelationshipApi(token, {
        dataSourceId,
        sourceTableId: sourceTable.id,
        sourceColumnId: sourceCol.id,
        targetTableId: targetTable.id,
        targetColumnId: targetCol.id,
        cardinality: relModalData.cardinality,
        relType: relModalData.relType,
        joinType: relModalData.joinType,
        joinExpression: `${sourceTable.tableName}.${sourceCol.columnName} = ${targetTable.tableName}.${targetCol.columnName}`,
        businessDescription: relModalData.businessDescription || `Relacionamento lógico entre ${sourceTable.tableName} e ${targetTable.tableName}`,
        priority: relModalData.priority,
      });

      if (res.success) {
        setPendingConnection(null);
        loadGraph();
      } else {
        alert(`Erro ao criar relacionamento: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  // Salvar Posicionamento Manual do Layout
  const handleSaveLayout = async () => {
    if (!token || nodes.length === 0) return;
    setIsSavingLayout(true);
    try {
      const positions = nodes.map((n) => ({
        id: n.id,
        posX: n.position.x,
        posY: n.position.y,
      }));
      await saveSemanticLayoutApi(token, positions);
      alert('Posições do mapa salvas com sucesso!');
    } catch (err: any) {
      alert(`Erro ao salvar layout: ${err.message}`);
    } finally {
      setIsSavingLayout(false);
    }
  };

  // Organizar Automaticamente (Grid Inteligente)
  const handleAutoLayout = () => {
    setNodes((prevNodes) =>
      prevNodes.map((node, idx) => {
        const cols = Math.ceil(Math.sqrt(prevNodes.length * 1.5));
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        return {
          ...node,
          position: {
            x: col * 380 + 60,
            y: row * 420 + 60,
          },
        };
      })
    );
  };

  // Sincronizar Estrutura
  const handleSyncSchema = async () => {
    if (!token || !dataSourceId) return;
    setIsSyncing(true);
    try {
      const res = await syncSemanticSchemaApi(token, dataSourceId);
      if (res.success) {
        alert(
          `Sincronização concluída com sucesso em ${res.executionTimeMs}ms!\n\n` +
            `• Tabelas sincronizadas: ${res.tablesSynced}\n` +
            `• Colunas sincronizadas: ${res.columnsSynced}\n` +
            `• FKs físicas detectadas: ${res.relationshipsDetected}\n` +
            `• Tabelas ausentes: ${res.missingTablesCount}`
        );
        loadGraph();
      } else {
        alert(`Erro na sincronização: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro ao sincronizar: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Salvar Edição do Drawer (Tabela ou Coluna)
  const handleSaveDrawer = async () => {
    if (!token) return;
    setIsSavingDrawer(true);
    try {
      if (selectedColumn) {
        await updateSemanticColumnApi(token, selectedColumn.id, {
          displayName: selectedColumn.displayName,
          businessDescription: selectedColumn.businessDescription,
          synonyms: selectedColumn.synonyms,
          classification: selectedColumn.classification,
          aiEnabled: selectedColumn.aiEnabled,
        });
      } else if (selectedTable) {
        await updateSemanticTableApi(token, selectedTable.id, {
          displayName: selectedTable.displayName,
          businessDescription: selectedTable.businessDescription,
          businessDomain: selectedTable.domain,
          synonyms: selectedTable.synonyms,
          usageNotes: selectedTable.usageNotes,
          doNotUseNotes: selectedTable.doNotUseNotes,
          priority: selectedTable.priority,
          aiEnabled: selectedTable.aiEnabled,
        });
      }
      loadGraph();
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSavingDrawer(false);
    }
  };

  // Clique em uma Aresta para inspecionar relacionamento
  const onEdgeClick = (_: any, edge: Edge) => {
    const found = rawEdges.find((e) => e.id === edge.id);
    if (found) {
      setSelectedEdge(found);
      setSelectedTable(null);
      setSelectedColumn(null);
    }
  };

  return (
    <div className="relative w-full h-[760px] bg-[#090b10] rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl flex flex-col font-sans">
      {/* Barra de Ações Superior do Mapa */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300">
            <Database className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-100">{dataSourceName}</span>
          </div>

          {/* Busca por tabela ou coluna */}
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar tabela ou coluna..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Filtro por Domínio */}
          {availableDomains.length > 0 && (
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todos os Domínios</option>
              {availableDomains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {/* Filtro Somente IA */}
          <button
            onClick={() => setOnlyAiEnabled(!onlyAiEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              onlyAiEnabled
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Somente IA
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Organizar Automaticamente */}
          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors shadow-sm"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Organizar Layout
          </button>

          {/* Salvar Posições */}
          <button
            onClick={handleSaveLayout}
            disabled={isSavingLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            {isSavingLayout ? 'Salvando...' : 'Salvar Posições'}
          </button>

          {/* Sincronizar Estrutura */}
          <button
            onClick={handleSyncSchema}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-950/40 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Estrutura'}
          </button>
        </div>
      </div>

      {/* Canvas Principal do React Flow */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="#1e293b" gap={20} size={1} variant={BackgroundVariant.Dots} />
          <Controls className="!bg-slate-900/90 !border-slate-800 !text-slate-300 !fill-slate-300 rounded-xl overflow-hidden shadow-xl" />
          <MiniMap
            className="!bg-slate-950/90 !border-slate-800 rounded-xl overflow-hidden shadow-2xl"
            nodeColor="#38bdf8"
            maskColor="rgba(15, 23, 42, 0.7)"
          />
        </ReactFlow>

        {/* Rodapé informativo de status */}
        <div className="absolute bottom-3 left-4 z-10 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-4 shadow-lg backdrop-blur-md">
          <span>
            <strong className="text-slate-200">{nodes.length}</strong> tabelas visíveis
          </span>
          <span>•</span>
          <span>
            <strong className="text-slate-200">{edges.length}</strong> relacionamentos
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" /> Conectores prontos para arrastar
          </span>
        </div>
      </div>

      {/* Painel Lateral Direito (Drawer de Propriedades da Tabela ou Coluna) */}
      {(selectedTable || selectedEdge) && (
        <div className="absolute top-[57px] right-0 bottom-0 w-96 bg-slate-900/95 border-l border-slate-800 shadow-2xl backdrop-blur-xl z-20 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-slate-100">
                {selectedEdge
                  ? 'Relacionamento Semântico'
                  : selectedColumn
                  ? `Coluna: ${selectedColumn.columnName}`
                  : `Tabela: ${selectedTable?.tableName}`}
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedTable(null);
                setSelectedColumn(null);
                setSelectedEdge(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Conteúdo do Drawer */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-300">
            {/* 1. Edição de Coluna */}
            {selectedColumn ? (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Nome Amigável</label>
                  <input
                    type="text"
                    value={selectedColumn.displayName || ''}
                    onChange={(e) => setSelectedColumn({ ...selectedColumn, displayName: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Classificação Semântica</label>
                  <select
                    value={selectedColumn.classification || 'dimension'}
                    onChange={(e) => setSelectedColumn({ ...selectedColumn, classification: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="identifier">Identificador (ID / Chave)</option>
                    <option value="dimension">Dimensão (Atributo / Categoria)</option>
                    <option value="measure">Métrica / Medida (Valor numérico)</option>
                    <option value="date">Data / Temporal</option>
                    <option value="status">Status / Situação</option>
                    <option value="sensitive">Dado Sensível / PII</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Descrição Empresarial</label>
                  <textarea
                    rows={3}
                    value={selectedColumn.businessDescription || ''}
                    onChange={(e) => setSelectedColumn({ ...selectedColumn, businessDescription: e.target.value })}
                    placeholder="Significado empresarial desta coluna..."
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Sinônimos (separados por vírgula)</label>
                  <input
                    type="text"
                    value={selectedColumn.synonyms || ''}
                    onChange={(e) => setSelectedColumn({ ...selectedColumn, synonyms: e.target.value })}
                    placeholder="ex: cpf, documento, cliente"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[11px] font-medium text-slate-300">Visível para a IA</span>
                  <input
                    type="checkbox"
                    checked={selectedColumn.aiEnabled}
                    onChange={(e) => setSelectedColumn({ ...selectedColumn, aiEnabled: e.target.checked })}
                    className="w-4 h-4 accent-cyan-500 rounded"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedColumn(null)}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  ← Voltar para propriedades da tabela
                </button>
              </>
            ) : selectedTable ? (
              /* 2. Edição de Tabela */
              <>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Nome Amigável</label>
                  <input
                    type="text"
                    value={selectedTable.displayName || ''}
                    onChange={(e) => setSelectedTable({ ...selectedTable, displayName: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Domínio</label>
                    <input
                      type="text"
                      value={selectedTable.domain || ''}
                      onChange={(e) => setSelectedTable({ ...selectedTable, domain: e.target.value })}
                      placeholder="ex: Vendas, CRM, Fiscal"
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Prioridade</label>
                    <select
                      value={selectedTable.priority || 'normal'}
                      onChange={(e) => setSelectedTable({ ...selectedTable, priority: e.target.value })}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="low">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Descrição Empresarial</label>
                  <textarea
                    rows={2}
                    value={selectedTable.businessDescription || ''}
                    onChange={(e) => setSelectedTable({ ...selectedTable, businessDescription: e.target.value })}
                    placeholder="Descrição do propósito da tabela no negócio..."
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Sinônimos (separados por vírgula)</label>
                  <input
                    type="text"
                    value={selectedTable.synonyms || ''}
                    onChange={(e) => setSelectedTable({ ...selectedTable, synonyms: e.target.value })}
                    placeholder="ex: pedidos, faturamento, cupom fiscal"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Quando Utilizar (Usage Notes)</label>
                  <textarea
                    rows={2}
                    value={selectedTable.usageNotes || ''}
                    onChange={(e) => setSelectedTable({ ...selectedTable, usageNotes: e.target.value })}
                    placeholder="Diretrizes para o LLM sobre quando consultar esta tabela..."
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-rose-400">Quando NÃO Utilizar</label>
                  <textarea
                    rows={2}
                    value={selectedTable.doNotUseNotes || ''}
                    onChange={(e) => setSelectedTable({ ...selectedTable, doNotUseNotes: e.target.value })}
                    placeholder="Restrições para evitar que a IA cometa erros..."
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[11px] font-medium text-slate-300">Habilitada para IA</span>
                  <input
                    type="checkbox"
                    checked={selectedTable.aiEnabled}
                    onChange={(e) => setSelectedTable({ ...selectedTable, aiEnabled: e.target.checked })}
                    className="w-4 h-4 accent-cyan-500 rounded"
                  />
                </div>
              </>
            ) : selectedEdge ? (
              /* 3. Detalhes de Relacionamento */
              <>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-[11px] text-slate-400 font-mono">
                    Expressão: <strong className="text-cyan-300">{selectedEdge.joinExpression}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Tipo: <strong className="text-slate-200">{selectedEdge.relType}</strong></span>
                    <span>Cardinalidade: <strong className="text-slate-200">{selectedEdge.cardinality}</strong></span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>JOIN Padrão: <strong className="text-slate-200">{selectedEdge.joinType}</strong></span>
                    <span>Status: <strong className="text-emerald-400">{selectedEdge.status}</strong></span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Descrição do Relacionamento</label>
                  <textarea
                    rows={3}
                    value={selectedEdge.businessDescription || ''}
                    onChange={(e) => setSelectedEdge({ ...selectedEdge, businessDescription: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={async () => {
                      if (!token) return;
                      await updateSemanticRelationshipApi(token, selectedEdge.id, {
                        status: selectedEdge.status === 'validated' ? 'disabled' : 'validated',
                      });
                      loadGraph();
                      setSelectedEdge(null);
                    }}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
                  >
                    {selectedEdge.status === 'validated' ? 'Desabilitar' : 'Aprovar/Validar'}
                  </button>

                  <button
                    onClick={async () => {
                      if (!token || !confirm('Excluir este relacionamento?')) return;
                      await deleteSemanticRelationshipApi(token, selectedEdge.id);
                      loadGraph();
                      setSelectedEdge(null);
                    }}
                    className="p-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {/* Rodapé de Ações do Drawer */}
          {(selectedTable || selectedColumn) && (
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedTable(null);
                  setSelectedColumn(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDrawer}
                disabled={isSavingDrawer}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
              >
                {isSavingDrawer ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de Configuração de Nova Conexão Arrastada */}
      {pendingConnection && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-cyan-400" />
                <span>Configurar Novo Relacionamento</span>
              </h3>
              <button onClick={() => setPendingConnection(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Cardinalidade</label>
                  <select
                    value={relModalData.cardinality}
                    onChange={(e) => setRelModalData({ ...relModalData, cardinality: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="1:1">1:1 (Um para Um)</option>
                    <option value="1:N">1:N (Um para Muitos)</option>
                    <option value="N:1">N:1 (Muitos para Um)</option>
                    <option value="N:N">N:N (Muitos para Muitos)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">JOIN Padrão</label>
                  <select
                    value={relModalData.joinType}
                    onChange={(e) => setRelModalData({ ...relModalData, joinType: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="INNER">INNER JOIN</option>
                    <option value="LEFT">LEFT JOIN</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Tipo do Relacionamento</label>
                <select
                  value={relModalData.relType}
                  onChange={(e) => setRelModalData({ ...relModalData, relType: e.target.value })}
                  className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="logical">Relacionamento Lógico (sem FK física no banco)</option>
                  <option value="semantic">Relacionamento Semântico / Negócio</option>
                  <option value="manual">Manual / Especial</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Descrição Empresarial</label>
                <textarea
                  rows={2}
                  value={relModalData.businessDescription}
                  onChange={(e) => setRelModalData({ ...relModalData, businessDescription: e.target.value })}
                  placeholder="ex: Relaciona cada venda ao cliente responsável pela compra"
                  className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingConnection(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmConnection}
                className="px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                Criar Relacionamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
