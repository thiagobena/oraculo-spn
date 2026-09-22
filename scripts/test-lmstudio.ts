import dotenv from 'dotenv';
dotenv.config();

console.log('Testing LM Studio Connection...');

const baseUrl = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';
const token = process.env.LM_STUDIO_API_TOKEN;

async function testLMStudio() {
  console.log(`Connecting to LM Studio at ${baseUrl}...`);
  if (token) console.log(`Using API Token: ${token.substring(0, 10)}...`);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}/v1/models`, { headers });
    if (!res.ok) {
      console.error(`Error: LM Studio returned HTTP ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    const data = (await res.json()) as any;
    console.log('Successfully connected to LM Studio!');
    console.log(`Found ${data.data?.length || 0} models:`);
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((m: any) => {
        console.log(` - ID: ${m.id} | Name: ${m.name || m.id}`);
      });
    }
  } catch (err: any) {
    console.warn(`LM Studio unreachable at ${baseUrl}: ${err.message}`);
  }
}

testLMStudio();
