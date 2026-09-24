import { prisma } from '../db/prisma.js';

async function listCurrentPresets() {
  const connectors = await prisma.databaseConnector.findMany({
    include: { presets: true }
  });

  for (const c of connectors) {
    console.log(`Conector: ${c.name} (${c.id}) - Presets atuais (${c.presets.length}):`);
    c.presets.forEach(p => console.log(`  - [${p.category}] ${p.title} (${p.visualization_type})`));
  }
}

listCurrentPresets()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
