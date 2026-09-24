import fs from 'fs';

const data = JSON.parse(fs.readFileSync('src/scripts/datalake_analysis_clean.json', 'utf8'));

const transTables = [
  'tb_documentos',
  'tb_documentos_itens',
  'tb_analise_dre',
  'tb_conciliacao_bancaria'
];

transTables.forEach(name => {
  const t = data.find((x: any) => x.tableName === name);
  if (t) {
    console.log(`\n======================================================`);
    console.log(`TABELA: ${t.tableName} (${t.totalRows} linhas)`);
    console.log(`COLUNAS (${t.columns.length}):`);
    console.log(t.columns.map((c: any) => `${c.column_name} (${c.data_type})`).join(', '));
    console.log(`AMOSTRA:`);
    console.log(JSON.stringify(t.sample[0], null, 2));
  }
});
