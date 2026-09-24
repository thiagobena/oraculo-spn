import { prisma } from '../db/prisma.js';
import { DatabaseService } from './DatabaseService.js';
import { AuditService } from './AuditService.js';

export interface ScheduledJobConfig {
  id: string;
  name: string;
  time: string; // "08:00" | "19:00"
  type: 'morning_digest' | 'evening_digest' | 'anomaly_scan';
  enabled: boolean;
  webhook_url?: string;
  last_run?: string;
  last_status?: string;
}

export class SchedulerService {
  private static timer: NodeJS.Timeout | null = null;
  private static jobs: ScheduledJobConfig[] = [
    {
      id: 'job-morning',
      name: 'Resumo Executivo Matinal (08:00)',
      time: '08:00',
      type: 'morning_digest',
      enabled: true,
      last_status: 'Agendado',
    },
    {
      id: 'job-evening',
      name: 'Fechamento Operacional Diário (19:00)',
      time: '19:00',
      type: 'evening_digest',
      enabled: true,
      last_status: 'Agendado',
    },
    {
      id: 'job-anomalies',
      name: 'Varredura Proativa de Anomalias',
      time: '12:00',
      type: 'anomaly_scan',
      enabled: true,
      last_status: 'Agendado',
    },
  ];

  static init() {
    if (this.timer) clearInterval(this.timer);

    console.log('[SchedulerService] Inicializado agendador de relatórios e alertas automáticos.');
    
    // Check every 60 seconds
    this.timer = setInterval(() => {
      this.checkSchedules();
    }, 60000);
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static getJobs(): ScheduledJobConfig[] {
    return this.jobs;
  }

  static updateJob(id: string, partial: Partial<ScheduledJobConfig>) {
    const job = this.jobs.find((j) => j.id === id);
    if (job) {
      Object.assign(job, partial);
    }
    return job;
  }

  private static async checkSchedules() {
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    for (const job of this.jobs) {
      if (job.enabled && job.time === currentTimeStr) {
        // Run job
        console.log(`[SchedulerService] Executando disparo agendado: ${job.name} (${job.time})`);
        try {
          const report = await this.generateReport(job.type);
          job.last_run = new Date().toISOString();
          job.last_status = 'Sucesso';

          // Disparar Webhook se configurado
          if (job.webhook_url) {
            await this.dispatchWebhook(job.webhook_url, job.name, report);
          }

          await AuditService.log({
            clientId: 'system-scheduler',
            clientName: 'Oráculo Scheduler',
            action: `REPORT_TRIGGER_${job.type.toUpperCase()}`,
            status: 'SUCCESS',
            details: { jobName: job.name, time: currentTimeStr, summaryLength: report.length },
          });
        } catch (err: any) {
          job.last_status = `Erro: ${err.message}`;
          console.error(`[SchedulerService] Erro ao executar ${job.name}:`, err.message);
        }
      }
    }
  }

  /**
   * Disparo manual de um relatório executivo ou alerta
   */
  static async triggerReport(type: 'morning_digest' | 'evening_digest' | 'anomaly_scan', targetWebhook?: string) {
    const report = await this.generateReport(type);
    
    if (targetWebhook) {
      await this.dispatchWebhook(targetWebhook, `Relatório: ${type}`, report);
    }

    await AuditService.log({
      clientId: 'manual-trigger',
      clientName: 'Administrador',
      action: `MANUAL_REPORT_TRIGGER_${type.toUpperCase()}`,
      status: 'SUCCESS',
      details: { type, targetWebhook },
    });

    return {
      success: true,
      type,
      generatedAt: new Date().toISOString(),
      report,
    };
  }

  /**
   * Monta o conteúdo consolidado do relatório usando DatabaseService
   */
  static async generateReport(type: 'morning_digest' | 'evening_digest' | 'anomaly_scan'): Promise<string> {
    const connectors = await DatabaseService.listConnectors();
    const lakeConnector = connectors.find((c: any) => c.name.toLowerCase().includes('lake') || c.db_type === 'postgresql');
    const glpiConnector = connectors.find((c: any) => c.name.toLowerCase().includes('glpi') || c.db_type === 'mysql');

    const nowStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    let header = `📊 **ORÁCULO SPN — RELATÓRIO EXECUTIVO**\n📅 Data: ${nowStr}\n\n`;

    let lakeSection = '';
    let glpiSection = '';
    let anomalySection = '';

    // 1. Dados do Vetor Lake
    if (lakeConnector) {
      try {
        const lakeRes = await DatabaseService.executeQueryWithAutoHealing(
          lakeConnector.id,
          'faturamento hoje por filial',
          `SELECT 
             COUNT(DISTINCT d.codigo_documento) AS total_cupons,
             ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento,
             ROUND((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS ticket_medio
           FROM datalake.tb_documentos d
           INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
           WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1;`
        );

        if (lakeRes.success && lakeRes.rows.length > 0) {
          const r = lakeRes.rows[0];
          const fat = Number(r.total_faturamento || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const tm = Number(r.ticket_medio || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          lakeSection = `💰 **Vendas & Faturamento (Hoje)**:\n- **Faturamento Total**: ${fat}\n- **Volume de Cupons**: ${r.total_cupons || 0}\n- **Ticket Médio**: ${tm}\n\n`;
        }

        // Anomalias Vetor Lake
        const lakeAnomalies = await DatabaseService.detectAnomalies(lakeConnector.id);
        if (lakeAnomalies.length > 0) {
          anomalySection += `⚠️ **Alertas Vetor Lake**:\n${lakeAnomalies.map((a) => `- ${a.title}: ${a.message}`).join('\n')}\n\n`;
        }
      } catch (err: any) {
        lakeSection = `💰 **Vetor Lake**: Erro ao obter faturamento (${err.message})\n\n`;
      }
    }

    // 2. Dados do GLPI
    if (glpiConnector) {
      try {
        const glpiRes = await DatabaseService.executeQueryWithAutoHealing(
          glpiConnector.id,
          'resumo de chamados hoje',
          `SELECT 
             COUNT(*) AS total_chamados_hoje,
             SUM(CASE WHEN status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS pendentes_abertos,
             SUM(CASE WHEN status IN (5, 6) THEN 1 ELSE 0 END) AS concluidos_hoje
           FROM glpi_tickets 
           WHERE DATE(date) = CURDATE() AND is_deleted = 0;`
        );

        if (glpiRes.success && glpiRes.rows.length > 0) {
          const g = glpiRes.rows[0];
          glpiSection = `🎫 **Suporte & TI (GLPI Hoje)**:\n- **Abertos Hoje**: ${g.total_chamados_hoje || 0}\n- **Em Aberto / Pendentes**: ${g.pendentes_abertos || 0}\n- **Solucionados / Fechados**: ${g.concluidos_hoje || 0}\n\n`;
        }

        const glpiAnomalies = await DatabaseService.detectAnomalies(glpiConnector.id);
        if (glpiAnomalies.length > 0) {
          anomalySection += `🚨 **Alertas Críticos GLPI**:\n${glpiAnomalies.map((a) => `- ${a.title}: ${a.message}`).join('\n')}\n\n`;
        }
      } catch (err: any) {
        glpiSection = `🎫 **GLPI**: Erro ao obter chamados (${err.message})\n\n`;
      }
    }

    return `${header}${lakeSection}${glpiSection}${anomalySection}*Gerado automaticamente pelo Oráculo IA.*`;
  }

  private static async dispatchWebhook(url: string, title: string, content: string) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          text: content,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e: any) {
      console.warn('[SchedulerService] Falha ao enviar para webhook:', e.message);
    }
  }
}
