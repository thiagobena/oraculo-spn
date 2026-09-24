# Arquitetura Oráculo IA Versão 2: Camada Semântica & Mapa Visual de Relacionamentos

> **Documento Oficial de Arquitetura & Guia Operacional**  
> Plataforma: **Oráculo IA SPN**  
> Versão do Motor: **2.0.0 (Semantic Engine)**

---

## 1. Visão Geral & Princípio Fundamental

O objetivo da Versão 2 é erradicar alucinações na geração de SQL e interpretação de dados estruturados.

A premissa central é:
> **A LLM não deve ser responsável por "adivinhar o banco de dados".**  
> O sistema fornece um contexto enxuto, exato, semanticamente enriquecido e previamente validado por humanos através do **Mapa Visual de Dados**.

```mermaid
flowchart TD
    User([Usuário / Pergunta]) --> Intent[1. Intent Analyzer]
    Intent --> Retriever[2. Schema Retriever\n3 a 10 tabelas relevantes]
    Retriever --> Graph[3. Relationship Resolver\nDijkstra no Grafo Semântico]
    Graph --> Planner[4. Query Planner\nPlano Lógico Estruturado]
    Planner --> Generator[5. SQL Generator\nDialeto Específico + Few-Shot RAG]
    Generator --> Validator[6. SQL Validator\nRegras de Segurança & Limites]
    Validator --> AutoHeal{Executou com Sucesso?}
    AutoHeal -- Não (Max 2x) --> Generator
    AutoHeal -- Sim --> DB[(Banco Corporativo)]
    DB --> Interpreter[7. Result Interpreter\nResposta Executiva + Proveniência]
    Interpreter --> Chat([Chat com Card de Transparência])
```

---

## 2. Pipeline Decomposto de Execução (NL2SQL v2)

| Etapa | Serviço (`apps/api/src/services/semantic/`) | Responsabilidade |
| :--- | :--- | :--- |
| **1. Intent Analyzer** | `IntentAnalyzer.ts` | Extrai a intenção (ranking, agregação, filtro, temporal), entidades mencionadas, KPIs e detecta ambiguidades. |
| **2. Schema Retriever** | `SchemaRetriever.ts` | Pontua e filtra apenas 3 a 10 tabelas estritamente relevantes, evitando poluir o contexto da LLM. |
| **3. Relationship Resolver** | `RelationshipGraphService.ts` | Navega o grafo em memória via Dijkstra para traçar o menor caminho entre tabelas, ignorando arestas desabilitadas. |
| **4. Query Planner** | `QueryPlanner.ts` | Monta o plano lógico agnóstico (`baseTable`, `joins`, dimensões, métricas e filtros). |
| **5. SQL Generator** | `SQLGenerator.ts` | Transforma o plano lógico em SQL no dialeto do conector (PostgreSQL, MySQL, SQL Server) com Few-Shot RAG. |
| **6. SQL Validator** | `SQLValidator.ts` | Quality gate que restringe comandos a `SELECT`/`WITH`, bloqueia DDL/DML destrutivo, veta produtos cartesianos e injeta limites de linhas. |
| **7. Result Interpreter** | `ResultInterpreter.ts` | Sintetiza a resposta executiva e constrói o payload de transparência ("Como cheguei nesta resposta?"). |

---

## 3. Modelo de Dados da Camada Semântica

A persistência é gerenciada via Prisma no Microsoft SQL Server (`apps/api/prisma/schema.prisma`):

```mermaid
erDiagram
    SemanticTable ||--o{ SemanticColumn : "possui"
    SemanticTable ||--o{ SemanticRelationship : "origem/destino"
    SemanticTable }o--|| DatabaseConnector : "pertence a"
    BusinessTerm }o--|| DatabaseConnector : "associado a"
    SemanticMetric }o--|| DatabaseConnector : "calculada em"
    ValidatedQuery }o--|| DatabaseConnector : "gabarito de"

    SemanticTable {
        string id PK
        string table_name
        string display_name
        string business_description
        string business_domain
        string synonyms
        string status
        boolean ai_enabled
    }

    SemanticColumn {
        string id PK
        string column_name
        string display_name
        string data_type
        string classification
        boolean is_pk
        boolean is_fk
        boolean is_sensitive
    }

    SemanticRelationship {
        string id PK
        string source_table_id FK
        string target_table_id FK
        string cardinality
        string join_type
        string join_expression
        string status
        boolean is_active
    }
```

---

## 4. Guia Operacional do Administrador

### 4.1 Sincronização do Schema Técnico
1. Acesse o menu **Configurações ➔ Inteligência Semântica (v2)**.
2. Na aba **Mapa de Dados**, selecione a fonte de dados e clique no botão **"Sincronizar Estrutura"**.
3. O sistema introspecta tabelas, colunas, tipos e Foreign Keys físicas.
4. **Princípio de Preservação:** Descrições empresariais, sinônimos e nomes amigáveis já editados pelo administrador **nunca são sobrescritos**.

### 4.2 Criação e Gestão de Relacionamentos no Canvas
1. No canvas interativo (`@xyflow/react`), localize as duas tabelas.
2. Clique no handle de conexão da coluna de origem e arraste até o handle da coluna de destino.
3. No modal que se abrirá, configure:
   - **Cardinalidade:** `1:1`, `1:N`, `N:1` ou `N:N`.
   - **Tipo do Relacionamento:** Chave Estrangeira Real, Lógico, Semântico ou Manual.
   - **JOIN Padrão:** `INNER JOIN` ou `LEFT JOIN`.
   - **Expressão do JOIN:** ex: `tb_vendas.cliente_id = tb_clientes.id`.
   - **Descrição de Negócio:** quando a IA deve utilizar este caminho relacional.
4. Clique em **Salvar Relacionamento**. O grafo em memória atualizará automaticamente as rotas para a IA.

### 4.3 Dicionário de Negócios & Métricas Homologadas
- **Dicionário de Negócios:** Mapeie sinônimos e regras (ex: "Faturamento" ➔ `SUM(valor_liquido)` com filtro padrão `status = 'FINALIZADA'`).
- **Métricas:** Formalize os KPIs da empresa (Ticket Médio, Ruptura, MTTR, Margem) para impedir que a LLM invente fórmulas.

### 4.4 Biblioteca de Consultas Homologadas (Few-Shot RAG)
- Cadastre perguntas comuns associadas à consulta SQL ideal validada pela equipe técnica.
- Durante a geração de novas consultas semelhantes, o `SQLGenerator` recupera estes gabaritos como Few-Shot dinâmico.

### 4.5 Laboratório & Diagnóstico
- **Laboratório:** Digite qualquer pergunta em linguagem natural para inspecionar em tempo real cada passo do pipeline semântico (intenção, tabelas, plano lógico, SQL e tempo).
- **Diagnóstico:** Acompanhe a cobertura semântica (%) do seu banco e aprove sugestões automáticas de novos relacionamentos identificados pela inteligência da plataforma.

### 4.6 Funcionalidades Estratégicas Avançadas (Opções 1, 3, 4 e 5)
- **Opção 1 — Homologação 1-Click no Chat:**
  No card de transparência e proveniência do chat ("Como cheguei nesta resposta?"), o botão `⭐ Homologar como Gabarito` permite persistir imediatamente a pergunta e o SQL executado na biblioteca de `ValidatedQuery`, garantindo que consultas equivalentes sempre acertem com 100% de precisão.
- **Opção 3 — Cache Semântico de Consultas:**
  Motor de cache em memória no `SemanticDataEngine` com TTL configurável (padrão 300 segundos) e contadores de hits, misses e taxa de acerto. Perguntas repetidas são servidas em <10ms sem reexecutar no banco nem consumir tokens da LLM.
- **Opção 4 — Vigilância de Schema Drift Proativo:**
  Auditoria não-destrutiva entre o banco de dados físico e o catálogo da Camada Semântica. Detecta novas tabelas, tabelas removidas, novas colunas e colunas com alterações de tipo de dado, oferecendo sincronização com 1 clique.
- **Opção 5 — Federação Cross-Source (Relacionamentos Heterogêneos):**
  Suporte a conexões relacionais entre conectores de dados distintos (ex: GLPI ↔ Vetor Lake / ERP), permitindo que a IA monte rotas federadas e exiba no visualizador arestas pontilhadas fúcsia indicando cross-source.
- **Sub-aba de Configurações & Otimização:**
  Sub-aba dedicada na interface administrativa semântica para ligar/desligar cache, ajustar TTL, limpar cache em tempo real, disparar verificação de drift e configurar o limiar de confiança do motor.

---

## 5. Como Executar os Testes Automatizados

Para rodar a suíte completa de testes determinísticos do SQL Validator, menor caminho do Grafo, Cache Semântico, Schema Drift e Federação Cross-Source:

```bash
node --import tsx/esm scripts/test-semantic-engine.ts
```

Resultado esperado:
```text
📊 Resultado dos Testes: 20 de 20 testes aprovados.
🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!
```
