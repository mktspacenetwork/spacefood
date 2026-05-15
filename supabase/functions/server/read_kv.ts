import * as kv from './kv_store.tsx';
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

async function run() {
  const items = await kv.getByPrefix('menu:');
  console.log(JSON.stringify(items, null, 2));
}

run();