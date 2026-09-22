import { FastifyInstance } from 'fastify';
import { LMStudioProvider } from '@oraculo/ai-core';
import { TelemetryService } from '../services/TelemetryService.js';

export function registerTelemetryRoutes(fastify: FastifyInstance, provider: LMStudioProvider) {
  fastify.get('/api/telemetry', async (_req, reply) => {
    try {
      const data = await TelemetryService.getFullTelemetry(provider);
      return reply.send({ success: true, telemetry: data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/telemetry/benchmark', async (req, reply) => {
    try {
      const body = (req.body as any) || {};
      const result = await TelemetryService.runBenchmark(provider, body.model_key);
      return reply.send({ success: true, benchmark: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/api/telemetry/auto-router', async (_req, reply) => {
    try {
      const report = await TelemetryService.getAutoRouterReport(provider);
      return reply.send({ success: true, report });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/api/telemetry/dislikes', async (_req, reply) => {
    try {
      const dislikes = await TelemetryService.getDislikedFeedbacks();
      return reply.send({ success: true, dislikes });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });


  fastify.get('/api/telemetry/ws', { websocket: true }, (socket, _req) => {
    let interval: NodeJS.Timeout | null = null;

    const sendData = async () => {
      try {
        const data = await TelemetryService.getFullTelemetry(provider);
        socket.send(JSON.stringify({ type: 'telemetry_update', telemetry: data }));
      } catch (err: any) {
        socket.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    };

    // Send immediately on connect
    sendData();

    // Stream telemetry every 2 seconds
    interval = setInterval(sendData, 2000);

    socket.on('close', () => {
      if (interval) clearInterval(interval);
    });

    socket.on('error', (err: any) => {
      console.error('Telemetry WebSocket Error:', err);
      if (interval) clearInterval(interval);
    });
  });
}

