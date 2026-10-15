import { modelFromEnv } from '@/lib/assistant/model';
import { postAssistant, requestDeps } from '@/lib/handlers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postAssistant({ ...requestDeps(req), model: modelFromEnv() }, (await params).id, req);
}
