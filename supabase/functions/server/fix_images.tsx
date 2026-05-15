import * as kv from './kv_store.tsx';

export async function fixImages() {
  const items = await kv.getByPrefix('menu:');
  let updated = 0;
  
  for (const item of items) {
    if (!item.image) {
      const prompt = `delicious professional food photography of ${item.name}, high quality, studio lighting, restaurant plating`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true`;
      
      item.image = url;
      await kv.set(`menu:${item.id}`, item);
      updated++;
    }
  }
  return updated;
}
